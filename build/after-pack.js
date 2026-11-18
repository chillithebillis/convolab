// Ad-hoc sign the macOS app so it opens on Apple Silicon without a developer certificate.
const { execFileSync } = require('child_process');
const path = require('path');
exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
