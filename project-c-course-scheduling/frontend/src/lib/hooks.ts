import { api } from "./api";
import { useData } from "./useData";

export const useInstance = () => useData("instance", api.instance);
export const usePhase1 = () => useData("phase1", api.phase1);
export const useResults = () => useData("results", api.results);
