// kafkajs ships no ZSTD codec out of the box — CompressionCodecs[ZSTD]'s
// default throws KafkaJSNotImplemented (see kafkajs's
// src/protocol/message/compression/index.js). This registers one backed by
// Node's own zlib zstd support (built into node:zlib since Node 22.15 — this
// image runs Node 22, see Dockerfile — so no native dependency needed, same
// pattern zlib.gzip already uses for kafkajs's built-in GZIP codec).
// Side-effecting: import this module (for the registration) before any
// producer.send(..., { compression: CompressionTypes.ZSTD }) call.
//
// Named-import `CompressionCodecs` from 'kafkajs' throws at runtime under
// Node's ESM loader — "Named export 'CompressionCodecs' not found" — even
// though it's a plain property on kafkajs's CJS module.exports object
// (`CompressionTypes`, from that exact same object literal, imports fine;
// cjs-module-lexer's static named-export detection just misses this one
// property). `tsc`/type-only analysis doesn't catch this since it's a
// runtime-only ESM/CJS interop gap, not a type error. The default-import +
// destructure form below is what Node's own error message recommends and
// what actually works.
import zlib from 'node:zlib';
import kafkajs from 'kafkajs';
const { CompressionCodecs, CompressionTypes } = kafkajs;

CompressionCodecs[CompressionTypes.ZSTD] = () => ({
  compress: async (encoder: { buffer: Buffer }) => zlib.zstdCompressSync(encoder.buffer),
  decompress: async (buffer: Buffer) => zlib.zstdDecompressSync(buffer),
});
