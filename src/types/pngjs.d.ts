// Tipos mínimos para 'pngjs' (el paquete no incluye declaraciones de TypeScript).
declare module 'pngjs' {
  export interface PNGOptions {
    width?: number
    height?: number
    [key: string]: unknown
  }

  export class PNG {
    constructor(options?: PNGOptions)
    width: number
    height: number
    data: Buffer
    static sync: {
      read(buffer: Buffer, options?: Record<string, unknown>): PNG
      write(png: PNG, options?: Record<string, unknown>): Buffer
    }
  }
}
