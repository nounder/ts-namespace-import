const path = require("node:path")
const ts = require("typescript/lib/tsserverlibrary")

const { ScriptElementKind } = ts
const tsutils = require("tsutils")

/**
 * @typedef {Object} PluginOptions
 * @property {readonly string[]} paths
 * @property {boolean} [ignoreNamedExport]
 * @property {"upperCamelCase" | "lowerCamelCase"} [nameTransform]
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
      sortText: name,
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

  const modulePaths = options.paths.flatMap((dirPath) => {
    return project.readDirectory(path.resolve(currentDir, dirPath), [".ts", ".js"])
  })

  return [...new Set(modulePaths)]
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

  let specifier
  if (compilerOptions.baseUrl) {
    specifier = path.posix.relative(compilerOptions.baseUrl, modulePath)
  } else {
    specifier = "./" + path.posix.relative(path.dirname(selfPath), modulePath)
  }

  return getFilePathWithoutExt(specifier)
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
    return camelCase(name, { pascalCase: options.nameTransform === "upperCamelCase" })
  } else {
    return name
  }
}

/**
 * Simple camelCase implementation
 * @param {string} str
 * @param {Object} [options]
 * @param {boolean} [options.pascalCase=false]
 * @returns {string}
 */
function camelCase(str, options = {}) {
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
  getCodeFixActionByName
}
