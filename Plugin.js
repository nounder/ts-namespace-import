const path = require("node:path")
const ts = require("typescript/lib/tsserverlibrary")

const { ScriptElementKind } = ts
const tsutils = require("tsutils")

/**
 * @typedef {Object} PluginOptions
 * @property {readonly string[]} [paths]
 * @property {boolean} [ignoreNamedExport]
 * @property {"PascalCase" | "camelCase"} [nameTransform]
 * @property {boolean} [capitalizedFilesOnly]

 */

/**
 * @param {ts.server.PluginCreateInfo} info
 * @returns {ts.CompletionEntry[]}
 */
function getCompletionEntries(info) {
  const modulePaths = getModulePathsToImport(info.config.options, info.project)

  return modulePaths.map((modulePath) => {
    const name = transformImportName(
      getFileNameWithoutExt(modulePath),
      info.config.options
    )
    return {
      name: name,
      kind: ScriptElementKind.alias,
      source: modulePath,
      sortText: "16" + name, // Lower priority than local symbols (TS uses 11-15 for locals)
      hasAction: true,
      isImportStatementCompletion: true,
      data: {
        exportName: name,
        modulePath: modulePath
      }
    }
  })
}

/**
 * @param {ts.CompletionEntry[]} entries
 * @param {ts.server.PluginCreateInfo} info
 * @returns {ts.CompletionEntry[]}
 */
function filterNamedImportEntries(entries, info) {
  /** @type {PluginOptions} */
  const options = info.config.options
  if (!options.ignoreNamedExport) {
    return entries
  }

  const currentDir = info.project.getCurrentDirectory()
  const dirPaths = options.paths.map((dirPath) => path.resolve(currentDir, dirPath))
  return entries.filter((entry) => {
    return !dirPaths.some(
      (dirPath) => entry.data?.exportName && entry.data.fileName?.startsWith(dirPath)
    )
  })
}

/**
 * @param {ts.SourceFile | undefined} sourceFile
 * @param {number} position
 * @returns {boolean}
 */
function isAutoCompletablePosition(sourceFile, position) {
  if (!sourceFile) {
    return false
  }
  const token =
    tsutils.getTokenAtPosition(sourceFile, position)?.kind ?? ts.SyntaxKind.Unknown
  return token !== ts.SyntaxKind.StringLiteral
}

/**
 * @param {string} name
 * @param {string} selfPath
 * @param {string} modulePath
 * @param {ts.server.PluginCreateInfo} info
 * @returns {ts.CompletionEntryDetails}
 */
function getCompletionEntryDetails(name, selfPath, modulePath, info) {
  /** @type {ts.CodeFixAction} */
  const action = getCodeFixActionFromPath(name, selfPath, modulePath, info.project)
  return {
    name: name,
    kind: ScriptElementKind.alias,
    kindModifiers: "",
    displayParts: [],
    codeActions: [action]
  }
}

/**
 * @param {string} selfPath
 * @param {number} start
 * @param {number} end
 * @param {ts.server.PluginCreateInfo} info
 * @returns {ts.CodeFixAction | null}
 */
function getCodeFixActionByName(selfPath, start, end, info) {
  const name = info.languageService
    .getProgram()
    ?.getSourceFile(selfPath)
    ?.text.slice(start, end)
  if (!name) {
    return null
  }

  const modulePaths = getModulePathsToImport(info.config.options, info.project)
  const modulePath = modulePaths.find(
    (filePath) => getFileNameWithoutExt(filePath) === name
  )
  if (modulePath) {
    return getCodeFixActionFromPath(name, selfPath, modulePath, info.project)
  } else {
    return null
  }
}

/**
 * @param {PluginOptions} options
 * @param {ts.server.Project} project
 * @returns {string[]}
 */
function getModulePathsToImport(options, project) {
  const currentDir = project.getCurrentDirectory()

  let modulePaths
  if (options.paths && options.paths.length > 0) {
    // Use specified paths
    modulePaths = options.paths.flatMap((dirPath) => {
      return project.readDirectory(path.resolve(currentDir, dirPath), [
        ".ts",
        ".tsx",
        ".js",
        ".jsx"
      ])
    })
  } else {
    // Default: scan entire project directory
    modulePaths = project.readDirectory(
      currentDir,
      [".ts", ".tsx", ".js", ".jsx"],
      undefined,
      undefined,
      10
    )
  }

  const filteredPaths = modulePaths.filter((filePath) => {
    const basename = getFileNameWithoutExt(filePath)
    if (basename.includes(".")) {
      return false
    }

    if (options.capitalizedFilesOnly) {
      return /^[A-Z]/.test(basename)
    }

    return true
  })

  return [...new Set(filteredPaths)]
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function getFileNameWithoutExt(filePath) {
  const ext = path.extname(filePath)
  return path.basename(filePath, ext)
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function getFilePathWithoutExt(filePath) {
  const ext = path.extname(filePath)
  return filePath.slice(0, filePath.length - ext.length)
}

/**
 * @param {string} selfPath
 * @param {string} modulePath
 * @param {ts.server.Project} project
 * @returns {string}
 */
function getModuleSpceifier(selfPath, modulePath, project) {
  const compilerOptions = project.getCompilerOptions()
  const program = project.getLanguageService().getProgram()
  const importingSourceFile = program?.getSourceFile(selfPath)

  // Use TypeScript's internal API with the project's actual host
  if (importingSourceFile && project.projectService?.host) {
    try {
      const host = project.projectService.host
      const moduleSpecifier = ts.moduleSpecifiers.getModuleSpecifier(
        compilerOptions,
        importingSourceFile,
        selfPath,
        modulePath,
        host
      )
      return moduleSpecifier
    } catch (e) {
      // If the internal API fails, we need a fallback
    }
  }

  // Simple fallback that respects importModuleSpecifierEnding
  let specifier
  if (compilerOptions.baseUrl) {
    specifier = path.posix.relative(compilerOptions.baseUrl, modulePath)
  } else {
    const selfDir = path.dirname(selfPath)
    const relativePath = path.relative(selfDir, modulePath)
    specifier = relativePath.startsWith(".") ? relativePath : "./" + relativePath
    // Convert Windows paths to posix for import statements
    specifier = specifier.replace(/\\/g, "/")
  }

  // Remove the original extension
  specifier = getFilePathWithoutExt(specifier)

  // Apply importModuleSpecifierEnding if specified
  if (compilerOptions.importModuleSpecifierEnding === "js") {
    // Use the actual file extension when importModuleSpecifierEnding is "js"
    const originalExt = path.extname(modulePath)
    specifier += originalExt
  } else if (compilerOptions.importModuleSpecifierEnding === "minimal") {
    // Keep without extension (current behavior)
  } else {
    // Default behavior - add the original extension
    const originalExt = path.extname(modulePath)
    specifier += originalExt
  }
  return specifier
}

/**
 * @param {string} name
 * @param {string} selfPath
 * @param {string} modulePath
 * @param {ts.server.Project} project
 * @returns {ts.CodeFixAction}
 */
function getCodeFixActionFromPath(name, selfPath, modulePath, project) {
  const moduleSpecifier = getModuleSpceifier(selfPath, modulePath, project)
  const text = `import * as ${name} from "${moduleSpecifier}";\n`
  return {
    fixName: "namespace-import",
    description: text,
    changes: [
      {
        fileName: selfPath,
        textChanges: [
          {
            span: {
              start: 0,
              length: 0
            },
            newText: text
          }
        ]
      }
    ],
    commands: []
  }
}

/**
 * @param {string} name
 * @param {PluginOptions} options
 * @returns {string}
 */
function transformImportName(name, options) {
  if (options.nameTransform) {
    return stringCase(name, { pascalCase: options.nameTransform === "PascalCase" })
  } else {
    return name
  }
}

/**
 * Simple string case transformation implementation
 * @param {string} str
 * @param {Object} [options]
 * @param {boolean} [options.pascalCase=false]
 * @returns {string}
 */
function stringCase(str, options = {}) {
  const words = str
    .replace(/[^a-zA-Z0-9]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
  const result = words
    .map((word, index) => {
      if (index === 0 && !options.pascalCase) {
        return word.toLowerCase()
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join("")

  return result
}

module.exports = {
  getCompletionEntries,
  filterNamedImportEntries,
  isAutoCompletablePosition,
  getCompletionEntryDetails,
  getCodeFixActionByName,
  getModuleSpceifier,
  getModulePathsToImport,
  getFileNameWithoutExt,
  transformImportName
}
