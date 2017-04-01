
const {join, dirname, basename} = require("path");
const bluebird = require("bluebird");

const glob = bluebird.promisify(require("glob"));
const fs = bluebird.promisifyAll(require("fs-extra"));
const cp = bluebird.promisifyAll(require("child_process"));
const _ = require("lodash");

async function getRelativeLibs (prefix) {
  const all = await glob("lib/**/*.dylib", {
    cwd: prefix,
  });

  const result = {
    links: [],
    libs: [],
  };
  await bluebird.each(all, async (path) => {
    const abspath = join(prefix, path);
    const stats = await fs.lstatAsync(abspath);
    if (stats.isSymbolicLink()) {
      const dest = await fs.readlinkAsync(abspath)
      result.links.push({path, dest});
    } else {
      result.libs.push(path);
    }
  });
  return result;
}

async function main () {
  const prefix32 = join(__dirname, "32");
  const prefix64 = join(__dirname, "64");
  const prefix = join(__dirname, "universal");
  const libs32 = await getRelativeLibs(prefix32);
  console.log(`32-bit libs: ${JSON.stringify(libs32, null, 2)}`);

  console.log(`Resetting prefix...`);
  await fs.removeAsync(prefix);
  await fs.mkdirsAsync(prefix);

  console.log(`Copying includes...`);
  await fs.copyAsync(join(prefix64, "include"), join(prefix, "include"));

  libdirs = _.uniq(_.map(libs32.libs, dirname));
  console.log(`Dirs: ${JSON.stringify(libdirs, null, 2)}`);

  await bluebird.map(libdirs, async (libdir) => {
    await fs.mkdirAsync(join(prefix, libdir));
  })

  console.log(`Creating fat libraries with lipo...`);
  const LIB_RE = /\s*(.*\.dylib)/
  await bluebird.map(libs32.libs, async (lib) => {
    const stats = await fs.lstatAsync(join(prefix64, lib));
    if (!stats.isFile()) {
      throw new Error(`${join(prefix64, lib)} is not a file`);
    }

    console.log(`> ${lib}`)
    await cp.execFileAsync("/usr/bin/lipo", [
      "-create",
      join(prefix32, lib),
      join(prefix64, lib),
      "-output",
      join(prefix, lib),
    ]);

    console.log(`Setting libname to ${basename(lib)}`)
    await cp.execFileAsync("/usr/bin/install_name_tool", [
      "-id",
      basename(lib),
      join(prefix, lib)
    ]);

    const otoolOutput = await cp.execFileAsync("/usr/bin/otool", [
      "-L",
      join(prefix, lib),
    ]);

    const oldNames = [];
    for (const line of otoolOutput.split("\n")) {
      const matches = LIB_RE.exec(line);
      if (matches) {
        const libname = matches[1];
        if (libname.startsWith(prefix64)) {
          console.log("Found dep that needs change: " + matches[1]);
          oldNames.push(libname);
        }
      }
    }

    for (const oldName of oldNames) {
      const newName = basename(oldName);
      console.log(`${oldName} => ${newName}`);
      await cp.execFileAsync("/usr/bin/install_name_tool", [
        "-change",
        oldName,
        newName,
        join(prefix, lib)
      ]);
    }
  });

  console.log(`Replicating links...`);
  await bluebird.map(libs32.links, async (link) => {
    console.log(`${link.path} => ${link.dest}`)
    await fs.symlinkAsync(link.dest, join(prefix, link.path));
  });
}

main();

