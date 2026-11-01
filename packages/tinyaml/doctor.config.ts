import { defineDoctorConfig } from "vite-doctor/config";
import tinyaml from "./src/doctor.ts";

export default defineDoctorConfig({
  extends: ["auto", "tinyaml/recommended"],
  extensions: [tinyaml({ exclude: ["**/node_modules/**", "**/dist/**", ".cache/**"] })],
});
