# fatcat

A terrible tool for macOS.

Given two prefixes, `32` and `64` in the cwd, merge those by:

  * copying headers
  * using `lipo` to merge actual library files
  * recreating the symlink structure for libraries

### Usage

```
npm i
node .
```

Make sure you have 32 & 64 dirs before.

Requires node.js >=7.4 or whichever first version shipped async/await!

### License

fatcat is released under the MIT license


