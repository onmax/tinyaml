// The part of sinon that json5 1.0.2's tests use: a stub that counts its
// calls and runs a fake, and puts the original back on restore().
const sinon = {
  stub(object: Record<string, unknown>, name: string) {
    const original = object[name];
    let fake: (...args: unknown[]) => unknown = () => undefined;
    let calls = 0;
    const stub = (...args: unknown[]) => {
      calls++;
      return fake(...args);
    };
    Object.defineProperty(stub, "calledTwice", { get: () => calls === 2 });
    stub.callsFake = (fn: typeof fake) => ((fake = fn), stub);
    stub.restore = () => {
      object[name] = original;
    };
    object[name] = stub;
    return stub;
  },
};
export default sinon;
