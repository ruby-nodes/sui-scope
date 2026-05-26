export const PACKAGE_NAME = "@sui-scope/probes";

export type { GrpcProviderConfig, MeasurementEvent } from "./types.js";
export { fetchChainHead, probeGrpc } from "./grpc-probe.js";
