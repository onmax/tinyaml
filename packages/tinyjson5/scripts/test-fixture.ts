// The part of test-fixture that comment-json's tests use: resolve() paths in
// their fixtures folder.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fixtures = fileURLToPath(new URL("../test/comment-json/fixtures", import.meta.url));
const fixture = () => ({ resolve: (...paths: string[]) => resolve(fixtures, ...paths) });
export { fixture as "module.exports" };
