const fs = require("fs");
const path = require("path");

// electron-builder 26.x can leave the main Electron binary looking for the
// original helper bundle names on macOS 26. Restore those names after packing.
exports.default = async function restoreElectronHelperNames({ appOutDir, packager }) {
  if (packager.platform.name !== "mac") return;

  const product = packager.appInfo.productFilename;
  const frameworksDir = path.join(appOutDir, `${product}.app`, "Contents", "Frameworks");
  const suffixes = ["", " (GPU)", " (Plugin)", " (Renderer)"];

  for (const suffix of suffixes) {
    const sourceBundle = path.join(frameworksDir, `${product} Helper${suffix}.app`);
    const targetBundle = path.join(frameworksDir, `Electron Helper${suffix}.app`);
    if (!fs.existsSync(sourceBundle) || fs.existsSync(targetBundle)) continue;

    fs.renameSync(sourceBundle, targetBundle);
    const macOSDir = path.join(targetBundle, "Contents", "MacOS");
    const sourceBinary = path.join(macOSDir, `${product} Helper${suffix}`);
    const targetBinary = path.join(macOSDir, `Electron Helper${suffix}`);
    if (fs.existsSync(sourceBinary)) fs.renameSync(sourceBinary, targetBinary);
  }
};
