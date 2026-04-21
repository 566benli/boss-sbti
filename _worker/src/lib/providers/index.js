import { mock } from "./mock.js";
import { xunhupay } from "./xunhupay.js";
import { payjs } from "./payjs.js";

export function getProvider(env) {
  const mode = (env.PAYMENT_MODE || "mock").toLowerCase();
  if (mode === "payjs") return payjs;
  if (mode === "xunhupay") return xunhupay;
  return mock;
}

export { mock, xunhupay, payjs };
