# writeJsonSync(file, object, [options])

Writes an object to a JSON file synchronously.

**Alias:** `writeJSONSync()`

## Arguments

| Argument | Type | Description |
|----------|------|-------------|
| file     | string | |
| object   | object | |
| [options] | object | |
| [options.spaces] | number\|string | Number of spaces or string to use for indentation; passed to [`JSON.stringify`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify) |
| [options.replacer] | function | JSON replacer; passed to [`JSON.stringify`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify) |
| [options.EOL] | string | Set EOL character. Default is `\n`. |
| [options.*] | | Any other options are passed to `jsonFile.writeFileSync()` |

## Example

```js
const fse = require('fs-extra')

fse.writeJsonSync('./package.json', { name: 'fs-extra' })

// With spaces option:
fse.writeJsonSync('./package.json', { name: 'fs-extra' }, { spaces: 2 })

// With replacer option:
function replacer (key, value) {
  // Filtering out properties
  if (typeof value === 'string') {
    return undefined
  }
  return value
}
fse.writeJsonSync('./package.json', { name: 'fs-extra', version: 1 }, { replacer })
```
