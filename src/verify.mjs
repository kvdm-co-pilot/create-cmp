// Public entry for the verify gate. The implementation lives in lib/verify.mjs;
// this re-export keeps `src/verify.mjs` as the documented north-star module
// (CONTRACT §"North-star gate").
export { runVerify, printVerifyVerdict } from "./lib/verify.mjs";
