# TypeScript Namespace Import Plugin

Start typing `StateMach` and you will see import auto-completion for importing module with this prefix as a namespace:

```ts
import * as StateMachine from "StateMachine"
```

No more barrel modules and manual typing!

Great for Effect code.

## Features

- **Auto-completion for namespace imports**: Start typing a module name and get completion suggestions for namespace imports
- **Filters test and utility files**: Excludes files with dots in their basename (e.g., `StateMachine.test.ts`, `utils.helper.js`) from autocomplete suggestions
- **Respects TypeScript compiler options**: Properly handles `importModuleSpecifierEnding` settings:
  - When set to `"js"`: Uses actual file extensions (`.ts`, `.tsx`, `.jsx`, etc.) in import specifiers
  - When set to `"minimal"`: Omits file extensions from import specifiers
  - Default behavior: Includes file extensions in import specifiers
- **Smart path resolution**: Works with both relative imports and `baseUrl` configurations
- **Fallback support**: Uses TypeScript's internal module resolution APIs when available, with reliable fallback logic

## Acknowledgement

[yukukotani/typescript-plugin-namespace-import](https://github.com/yukukotani/typescript-plugin-namespace-import) which served as a base for this project.

[Effect-TS/language-service](https://github.com/Effect-TS/language-service) for showing the power of tsserver plugins.
