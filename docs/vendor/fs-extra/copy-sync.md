# copySync(src, dest, [options])

Copy a file or directory synchronously. The directory can have contents. Like `cp -r`.

## Arguments

| Argument | Type | Description |
|----------|------|-------------|
| src      | string | Note that if `src` is a directory it will copy everything inside of this directory, not the entire directory itself (see [issue #537](https://github.com/jprichardson/node-fs-extra/issues/537), [cp(1)](http://man7.org/linux/man-pages/man1/cp.1.html)) |
| dest     | string | Note that if `src` is a file, `dest` cannot be a directory (see [issue #323](https://github.com/jprichardson/node-fs-extra/issues/323)) |
| [options] | object | |
| [options.overwrite] | boolean | overwrite existing file or directory, default is `true`. _Note that the copy operation will silently fail if you set this to `false` and the destination exists._ Use the `errorOnExist` option to change this behavior. |
| [options.errorOnExist] | boolean | when `overwrite` is `false` and the destination exists, throw an error. Default is `false`. |
| [options.dereference] | boolean | dereference symlinks, default is `false`. |
| [options.preserveTimestamps] | boolean | When true, will set last modification and access times to the ones of the original source files. When false, timestamp behavior is OS-dependent. Default is `false`. |
| [options.filter] | Function | Function to filter copied files/directories. Return `true` to copy the item, `false` to ignore it. |

## Example

```js
const fse = require('fs-extra')

// Copy file
fse.copySync('/tmp/myfile', '/tmp/mynewfile')

// Copy directory
fse.copySync('/tmp/mydir', '/tmp/mynewdir')

// With a filter function
const filterFunc = (src, dest) => {
  // your logic here
  // it will be copied if return true
}
fse.copySync('/tmp/mydir', '/tmp/mynewdir', { filter: filterFunc })
```
