import QRCode from "qrcode";

/**
 * Server-rendered QR as an inline SVG string. The "svg" renderer is pure
 * string output (no canvas/pngjs), so it runs fine on the Workers runtime.
 */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    margin: 1,
    color: { dark: "#141414", light: "#00000000" },
  });
}
