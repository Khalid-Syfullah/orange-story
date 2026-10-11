// mp4-encode: the macOS fallback encoder for scripts/art-import.mjs when ffmpeg is not on PATH.
//
//   mp4-encode <out.mp4> <width> <height> <fps> <frames> <kbps>
//
// Reads <frames> raw BGRA frames (width*height*4 bytes each) from stdin and writes an H.264
// (High profile, yuv420, BT.709 primaries and matrix, sRGB transfer) mp4 with no audio track and
// the moov atom up front (faststart), through AVFoundation's hardware encoder. The sRGB transfer
// tag makes players decode the frames to the same values as the JPEG posters and frame sequences
// (a BT.709 transfer tag shows them about 5% brighter). Compiled once by the import into
// node_modules/.cache.
import AVFoundation
import CoreVideo
import Foundation

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(("mp4-encode: " + message + "\n").data(using: .utf8)!)
  exit(1)
}

let args = CommandLine.arguments
guard args.count == 7,
  let width = Int(args[2]), let height = Int(args[3]), let fps = Int32(args[4]),
  let frameCount = Int(args[5]), let kbps = Int(args[6])
else { fail("usage: mp4-encode <out.mp4> <width> <height> <fps> <frames> <kbps>") }

let outURL = URL(fileURLWithPath: args[1])
try? FileManager.default.removeItem(at: outURL)

let writer: AVAssetWriter
do { writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4) } catch { fail("\(error)") }
writer.shouldOptimizeForNetworkUse = true

let settings: [String: Any] = [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: width,
  AVVideoHeightKey: height,
  AVVideoColorPropertiesKey: [
    AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
    AVVideoTransferFunctionKey: AVVideoTransferFunction_IEC_sRGB,
    AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
  ],
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: kbps * 1000,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    AVVideoH264EntropyModeKey: AVVideoH264EntropyModeCABAC,
    AVVideoMaxKeyFrameIntervalKey: Int(fps) * 2,
    AVVideoExpectedSourceFrameRateKey: Int(fps),
    AVVideoAllowFrameReorderingKey: true,
  ],
]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(
  assetWriterInput: input,
  sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height,
  ])
guard writer.canAdd(input) else { fail("cannot add the video input") }
writer.add(input)
guard writer.startWriting() else { fail("cannot start: \(String(describing: writer.error))") }
writer.startSession(atSourceTime: .zero)

let frameBytes = width * height * 4
let stdin = FileHandle.standardInput

func readFrame() -> Data? {
  var data = Data(capacity: frameBytes)
  while data.count < frameBytes {
    let chunk = stdin.readData(ofLength: frameBytes - data.count)
    if chunk.isEmpty { return nil }
    data.append(chunk)
  }
  return data
}

for index in 0..<frameCount {
  guard let frame = readFrame() else { fail("stdin ended after \(index) of \(frameCount) frames") }
  while !input.isReadyForMoreMediaData { usleep(2000) }
  guard let pool = adaptor.pixelBufferPool else { fail("no pixel buffer pool: \(String(describing: writer.error))") }
  var buffer: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
  guard let pixels = buffer else { fail("cannot allocate a pixel buffer") }
  CVPixelBufferLockBaseAddress(pixels, [])
  let base = CVPixelBufferGetBaseAddress(pixels)!
  let stride = CVPixelBufferGetBytesPerRow(pixels)
  frame.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
    let src = raw.baseAddress!
    for row in 0..<height {
      memcpy(base.advanced(by: row * stride), src.advanced(by: row * width * 4), width * 4)
    }
  }
  CVPixelBufferUnlockBaseAddress(pixels, [])
  if !adaptor.append(pixels, withPresentationTime: CMTime(value: CMTimeValue(index), timescale: fps)) {
    fail("append failed at frame \(index): \(String(describing: writer.error))")
  }
}

input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if writer.status != .completed { fail("finish failed: \(String(describing: writer.error))") }
