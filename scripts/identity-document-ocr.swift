import Foundation
import PDFKit
import Vision
import AppKit

struct OcrPage: Encodable {
  let pageNumber: Int
  let lines: [String]
}

struct OcrResult: Encodable {
  let pages: [OcrPage]
}

func cgImageFromPdfPage(_ page: PDFPage) -> CGImage? {
  let box = page.bounds(for: .mediaBox)
  let scale: CGFloat = 2.0
  let width = max(1, Int(box.width * scale))
  let height = max(1, Int(box.height * scale))
  guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: width,
    pixelsHigh: height,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ) else { return nil }

  rep.size = NSSize(width: box.width, height: box.height)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  NSColor.white.setFill()
  NSBezierPath(rect: NSRect(x: 0, y: 0, width: box.width, height: box.height)).fill()
  if let context = NSGraphicsContext.current?.cgContext {
    page.draw(with: .mediaBox, to: context)
  }
  NSGraphicsContext.restoreGraphicsState()
  return rep.cgImage
}

func cgImageFromImageFile(_ url: URL) -> CGImage? {
  guard let image = NSImage(contentsOf: url) else { return nil }
  var rect = NSRect(origin: .zero, size: image.size)
  return image.cgImage(forProposedRect: &rect, context: nil, hints: nil)
}

func recognizeLines(_ cgImage: CGImage) -> [String] {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  if #available(macOS 13.0, *) {
    request.revision = VNRecognizeTextRequestRevision3
    request.recognitionLanguages = ["ja-JP", "en-US", "zh-Hans"]
  } else {
    request.recognitionLanguages = ["ja-JP", "en-US"]
  }

  let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
  do {
    try handler.perform([request])
  } catch {
    return []
  }

  return (request.results ?? [])
    .compactMap { observation in observation.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines) }
    .filter { !$0.isEmpty }
}

let arguments = CommandLine.arguments.dropFirst()
guard let inputPath = arguments.first else {
  fputs("missing input path\n", stderr)
  exit(64)
}

let url = URL(fileURLWithPath: inputPath)
var pages: [OcrPage] = []

if let document = PDFDocument(url: url) {
  for index in 0..<document.pageCount {
    guard let page = document.page(at: index), let image = cgImageFromPdfPage(page) else { continue }
    pages.append(OcrPage(pageNumber: index + 1, lines: recognizeLines(image)))
  }
} else if let image = cgImageFromImageFile(url) {
  pages.append(OcrPage(pageNumber: 1, lines: recognizeLines(image)))
} else {
  fputs("unsupported document\n", stderr)
  exit(65)
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.withoutEscapingSlashes]
let data = try encoder.encode(OcrResult(pages: pages))
FileHandle.standardOutput.write(data)
