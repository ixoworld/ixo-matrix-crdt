declare module 'vscode-lib' {
  export namespace uuid {
    export function generateUuid(): string;
  }
  
  export namespace logger {
    export function log(message: string, ...args: any[]): void;
    export function warn(message: string, ...args: any[]): void;
    export function error(message: string, ...args: any[]): void;
  }
  
  export namespace event {
    export class Emitter<T> {
      readonly event: Event<T>;
      fire(event: T): void;
      dispose(): void;
    }
    
    export interface Event<T> {
      (listener: (e: T) => any, thisArg?: any): IDisposable;
    }
    
    // Make Event accessible as event.Event
    export const Event: {
      new <T>(): Event<T>;
      toPromise<T>(event: Event<T>): Promise<T>;
    };
  }
  
  export namespace lifecycle {
    export interface IDisposable {
      dispose(): void;
    }
    
    export class Disposable implements IDisposable {
      protected _register<T extends IDisposable>(o: T): T;
      dispose(): void;
    }
    
    export function toDisposable(fn: () => void): IDisposable;
  }
}