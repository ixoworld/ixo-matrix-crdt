import * as http from "http";
export declare function createSimpleServer(handler: (req: any, res: any) => Promise<void>, port?: number): Promise<http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>>;
export declare function runAutocannonFromNode(url: string): Promise<void>;
export declare function autocannonSeparateProcess(params: string[]): Promise<void>;
