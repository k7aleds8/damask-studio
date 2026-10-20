// `npm version x.y.z` runs this: manifest.json and versions.json follow package.json.
import fs from 'node:fs';

const version = process.env.npm_package_version;
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');

const manifest = read('manifest.json');
manifest.version = version;
write('manifest.json', manifest);

const versions = read('versions.json');
versions[version] = manifest.minAppVersion;
write('versions.json', versions);
