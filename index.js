const ts = require("typescript/lib/tsserverlibrary")
const namespaceImportPlugin = require("./Plugin.js")

/**
 * @typedef {Object} CompletionEntryData
 * @property {string} [modulePath]
 * @memberof ts
 */

function init() {
  /**
   * @param {ts.server.PluginCreateInfo} info
   */
  function create(info) {
    /**
     * @param {...unknown} params
     */
    const log = (...params) => {
      const text = params.map((p) => (p ? JSON.stringify(p) : p)).join(" ")
      info.project.projectService.logger.info(`[namespace-import] ${text}`)
    }

    log("Start init")

    const getCompletionsAtPosition = info.languageService.getCompletionsAtPosition
    /**
     * @param {string} fileName
     * @param {number} position
     * @param {ts.GetCompletionsAtPositionOptions} [options]
     * @returns {ts.CompletionInfo | undefined}
     */
    info.languageService.getCompletionsAtPosition = (fileName, position, options) => {
      log("getCompletionsAtPosition", { fileName, position, options })
      const original = getCompletionsAtPosition(fileName, position, options)
      if (
        original == null ||
        options?.triggerCharacter != null ||
        !namespaceImportPlugin.isAutoCompletablePosition(
          info.languageService.getProgram()?.getSourceFile(fileName),
          position
        )
      ) {
        return original
      }

      const originalEntries = namespaceImportPlugin.filterNamedImportEntries(
        original.entries,
        info
      )
      const namespaceImportEntries = namespaceImportPlugin.getCompletionEntries(info)
      original.entries = [...originalEntries, ...namespaceImportEntries]
      return original
    }

    const getCompletionEntryDetails = info.languageService.getCompletionEntryDetails
    /**
     * @param {string} fileName
     * @param {number} position
     * @param {string} name
     * @param {ts.FormatCodeOptions} [options]
     * @param {string} [source]
     * @param {ts.UserPreferences} [preferences]
     * @param {ts.CompletionEntryData} [data]
     * @returns {ts.CompletionEntryDetails | undefined}
     */
    info.languageService.getCompletionEntryDetails = (
      fileName,
      position,
      name,
      options,
      source,
      preferences,
      data
    ) => {
      log("getCompletionEntryDetails", { fileName, position, name, options, source })
      
      // Check if we should convert named exports to namespace imports
      if (info.config.options.namespaceNamedExports && source && !data?.modulePath) {
        const modulePaths = namespaceImportPlugin.getModulePathsToImport(info.config.options, info.project)
        const matchingModule = modulePaths.find(modulePath => {
          const moduleBasename = namespaceImportPlugin.getFileNameWithoutExt(modulePath)
          return source.includes(moduleBasename) || modulePath.includes(source)
        })
        
        if (matchingModule) {
          const namespaceName = namespaceImportPlugin.transformImportName(
            namespaceImportPlugin.getFileNameWithoutExt(matchingModule),
            info.config.options
          )
          return namespaceImportPlugin.getCompletionEntryDetails(
            namespaceName,
            fileName,
            matchingModule,
            info
          )
        }
      }
      
      if (data?.modulePath == null) {
        return getCompletionEntryDetails(
          fileName,
          position,
          name,
          options,
          source,
          preferences,
          data
        )
      }

      return namespaceImportPlugin.getCompletionEntryDetails(
        name,
        fileName,
        data.modulePath,
        info
      )
    }

    const getCodeFixesAtPosition = info.languageService.getCodeFixesAtPosition
    /**
     * @param {string} fileName
     * @param {number} start
     * @param {number} end
     * @param {readonly number[]} errorCodes
     * @param {ts.FormatCodeSettings} formatOptions
     * @param {ts.UserPreferences} preferences
     * @returns {readonly ts.CodeFixAction[]}
     */
    info.languageService.getCodeFixesAtPosition = (
      fileName,
      start,
      end,
      errorCodes,
      formatOptions,
      preferences
    ) => {
      log("getCodeFixesAtPosition", {
        fileName,
        start,
        end,
        errorCodes,
        formatOptions,
        preferences
      })
      const original = getCodeFixesAtPosition(
        fileName,
        start,
        end,
        errorCodes,
        formatOptions,
        preferences
      )

      const importAction = namespaceImportPlugin.getCodeFixActionByName(
        fileName,
        start,
        end,
        info
      )
      if (importAction) {
        return [importAction, ...original]
      }

      return original
    }
  }

  return { create }
}

module.exports = init

