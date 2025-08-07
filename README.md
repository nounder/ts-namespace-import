# TypeScript Namespace Import Plugin

Start typing `StateMach` and you will see import auto-completion for importing module with this prefix as a namespace:

```ts
import * as StateMachine from "StateMachine"
```

No more barrel modules and manual typing!

Great for Effect code.

## Features

- Auto-completion for namespace imports.
- Filters test and utility files: no `.test.ts`.
- Sensible sorting: ie. namespace imports appear before named imports.
- Selected exported symbols from auto-complete will create namespace imports instead of named imports
- Properly handles `importModuleSpecifierEnding` settings
- Works with both relative imports and `baseUrl` configurations

## Configuration

```typescript
interface PluginOptions {
  /**
   * Narrow down modules that should be automatically namespace-imported
   * @default {undefined} (project files)
   */
  paths?: readonly string[]

  /** Ignore named exports from specified paths in autocomplete
   * @default {false}
   */
  ignoreNamedExport?: boolean

  /** Transform module names based on filename
   * @default {undefined} (uses original filename)
   */
  nameTransform?: "PascalCase" | "camelCase"
}
```

## Acknowledgement

[yukukotani/typescript-plugin-namespace-import](https://github.com/yukukotani/typescript-plugin-namespace-import) which served as a base for this project.

[Effect-TS/language-service](https://github.com/Effect-TS/language-service) for showing the power of tsserver plugins.
