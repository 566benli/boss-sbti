import { mock } from "./mock.js";
import { xunhupay } from "./xunhupay.js";

export function getProvider(env) {
  const mode = (env.PAYMENT_MODE || "mock").toLowerCase();
  if (mode === "xunhupay") return xunhupay;
  return mock;
}

export { mock, xunhupay };
