# copy(src, dest, [options, callback])

Copy a file or directory. The directory can have contents. Like `cp -r`.

## Arguments

| Argument | Type | Description |
|----------|------|-------------|
| src      | string | Note that if `src` is a directory it will copy everything inside of this directory, not the entire directory itself (see [issue #537](https://github.com/jprichardson/node-fs-extra/issues/537), [cp(1)](http://man7.org/linux/man-pages/man1/cp.1.html) |
| dest     | string | Note that if `src` is a file, `dest` cannot be a directory (see [issue #323](https://github.com/jprichardson/node-fs-extra/issues/323)) |
| [options] | object | |
| [options.overwrite] | boolean | overwrite existing file or directory, default is `true`. _Note that the copy operation will silently fail if you set this to `false` and the destination exists._ Use the `errorOnExist` option to change this behavior. |
| [options.errorOnExist] | boolean | when `overwrite` is `false` and the destination exists, throw an error. Default is `false`. |
| [options.dereference] | boolean | dereference symlinks, default is `false`. |
| [options.preserveTimestamps] | boolean | When true, will set last modification and access times to the ones of the original source files. When false, timestamp behavior is OS-dependent. Default is `false`. |
| [options.filter] | Function | Function to filter copied files/directories. Return `true` to copy the item, `false` to ignore it. Can also return a `Promise` that resolves to `true` or `false` (or pass in an `async` function). |
| [callback] | Function | |

## Example

```js
const fse = require('fs-extra')

// With a callback:
fse.copy('/tmp/myfile', '/tmp/mynewfile', err => {
  if (err) return console.error(err)
  console.log('success!')
})

fse.copy('/tmp/mydir', '/tmp/mynewdir', err => {
  if (err) return console.error(err)
  console.log('success!')
})

// With a filter function:
const filterFunc = (src, dest) => {
  // your logic here
  // it will be copied if return true
}
fse.copy('/tmp/mydir', '/tmp/mynewdir', { filter: filterFunc }, err => {
  if (err) return console.error(err)
  console.log('success!')
})

// With Promises:
fse.copy('/tmp/myfile', '/tmp/mynewfile')
  .then(() => {
    console.log('success!')
  })
  .catch(err => {
    console.error(err)
  })

// With async/await:
async function example () {
  try {
    await fse.copy('/tmp/myfile', '/tmp/mynewfile')
    console.log('success!')
  } catch (err) {
    console.error(err)
  }
}

example()
```
