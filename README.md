# VideoBGRemover Node.js SDK

![npm version](https://img.shields.io/npm/v/%40videobgremover%2Fsdk.svg)
![Node.js versions](https://img.shields.io/node/v/%40videobgremover%2Fsdk.svg)
![License](https://img.shields.io/npm/l/%40videobgremover%2Fsdk.svg)

The official Node.js SDK for [VideoBGRemover](https://videobgremover.com) - Remove video backgrounds with AI and compose videos with FFmpeg.

📖 **[Full Documentation](https://docs.videobgremover.com/)** | 🐙 **[GitHub Repository](https://github.com/videobgremover/videobgremover-node)**

## Goal

This SDK simplifies using the VideoBGRemover API and abstracts the complexity of transparent video formats. It handles all the difficult parts of video composition, format conversion, and FFmpeg integration so you can focus on your application.

## Features

🎥 **Video Background Removal**: Remove backgrounds from videos using state-of-the-art AI models  
🎨 **Video Composition**: Layer videos with custom backgrounds, effects, and positioning  
⚡ **Multiple Formats**: Support for WebM (with alpha), ProRes, stacked videos, and more  
🛠️ **FFmpeg Integration**: Professional video processing and encoding capabilities  
📱 **Easy to Use**: Simple, TypeScript-first API with full type safety  
🔧 **Flexible**: From simple background replacement to complex multi-layer compositions

## Installation

```bash
npm install @videobgremover/sdk
```

### Requirements

- **Node.js 16+**
- **FFmpeg** - Required binary for video processing operations
- **VideoBGRemover API key**

**Note:** FFmpeg must be available in your system PATH. The SDK automatically detects and uses your FFmpeg installation for video composition, format conversion, and metadata extraction.

## Quick Start

```typescript
import { VideoBGRemoverClient, Video, Background, Composition, EncoderProfile, Anchor, SizeMode } from '@videobgremover/sdk'

// Initialize client
const client = new VideoBGRemoverClient(process.env.VIDEOBGREMOVER_API_KEY!)

// Remove background from video
const video = Video.open('https://example.com/video.mp4')

const foreground = await video.removeBackground({ client })

// Create composition with custom background
const background = Background.fromColor('#00FF00', 1920, 1080, 30.0)
const composition = new Composition(background)
composition.add(foreground).at(Anchor.CENTER).size(SizeMode.CONTAIN)

// Export final video
await composition.toFile('output.mp4', EncoderProfile.h264())
```

## API Key Setup

Create your API key in [API Management](https://videobgremover.com/api-management) and set it as an environment variable:

```bash
export VIDEOBGREMOVER_API_KEY="vbr_your_api_key_here"
```

Or pass it directly to the client:

```typescript
const client = new VideoBGRemoverClient('vbr_your_api_key_here')
```

## Cost & Credits

- Credit usage depends on video duration, model, frame rate, and optional turbo processing
- Check your balance: `(await client.credits()).remainingCredits`
- Processing time varies with the input, selected model, output format, and current capacity
- Processing failures trigger a credit refund

## Usage Examples

### Basic Background Removal

```typescript
import { VideoBGRemoverClient, Video, RemoveBGOptions, Prefer } from '@videobgremover/sdk'

const client = new VideoBGRemoverClient('your_api_key')

// Load video from file or URL
const video = Video.open('path/to/video.mp4')

// Configure processing options
const options = new RemoveBGOptions(Prefer.WEBM_VP9) // Output format preference

// Remove background
const foreground = await video.removeBackground({ client, options })
```

### Complete Workflow Example

```typescript
import {
  VideoBGRemoverClient, Video, Background, Composition, 
  EncoderProfile, Anchor, SizeMode, RemoveBGOptions, Prefer
} from '@videobgremover/sdk'

// Initialize client
const client = new VideoBGRemoverClient('your_api_key')

// Check credits first
const credits = await client.credits()
console.log(`Remaining credits: ${credits.remainingCredits}`)

// Process video
const video = Video.open('input.mp4')
const options = new RemoveBGOptions(Prefer.WEBM_VP9)

const statusCallback = (status: string) => {
  console.log(`Status: ${status}`)
}

const foreground = await video.removeBackground({
  client,
  options,
  waitPollSeconds: 2.0,
  onStatus: statusCallback,
})

// Create composition
const background = Background.fromImage('background.jpg', 30.0)
const comp = new Composition(background)

// Add main video
const layer = comp.add(foreground, 'main_video')
layer.at(Anchor.CENTER).size(SizeMode.CONTAIN).opacity(0.9)

// Export
await comp.toFile('final_output.mp4', EncoderProfile.h264({ crf: 20 }))
```

### Video-on-Video Composition

```typescript
// Process foreground video
const foregroundVideo = Video.open('person_talking.mp4')
const foreground = await foregroundVideo.removeBackground({ client })

// Create composition with video background
const backgroundVideo = Background.fromVideo('nature_scene.mp4')
const comp = new Composition(backgroundVideo)

// Add foreground video on top
comp.add(foreground, 'person').at(Anchor.CENTER).size(SizeMode.CONTAIN)

// Export final video
await comp.toFile('person_on_nature.mp4', EncoderProfile.h264({ crf: 20 }))
```

### Multiple Output Formats

```typescript
// High-quality H.264
await comp.toFile('output_hq.mp4', EncoderProfile.h264({ crf: 18, preset: 'slow' }))

// Transparent WebM for web use
await comp.toFile('output.webm', EncoderProfile.transparentWebm({ crf: 25 }))

// ProRes for professional editing  
await comp.toFile('output.mov', EncoderProfile.prores4444())

// PNG sequence for frame-by-frame work
await comp.toFile('frames/frame_%04d.png', EncoderProfile.pngSequence())
```

### Layer Positioning & Effects

```typescript
// Add a layer with positioning
const layer = comp.add(foreground, 'main')

// Positioning options
layer.at(Anchor.CENTER)                    // Center
layer.at(Anchor.TOP_LEFT, 100, 50)         // Top-left with offset

// Sizing options
layer.size(SizeMode.CONTAIN)                              // Fit within canvas
layer.size(SizeMode.PX, { width: 800, height: 600 })     // Exact pixels
layer.size(SizeMode.CANVAS_PERCENT, { percent: 50 })     // 50% of canvas size

// Visual effects
layer.opacity(0.8)                            // 80% opacity
layer.rotate(15.0)                            // Rotate 15 degrees
layer.crop(10, 20, 100, 200)                 // Crop rectangle

// Timing control
layer.start(2.0)                              // Start at 2 seconds
layer.end(10.0)                               // End at 10 seconds
layer.duration(5.0)                           // Show for 5 seconds

// Audio control
layer.audio(true, 0.8)                        // Enable audio at 80% volume
```

## Transparent Video Formats

The SDK supports multiple transparent video formats:

| Format | File Size | Quality | Compatibility | Best For |
|--------|-----------|---------|---------------|----------|
| **WebM VP9** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | Web applications, small files |
| **Stacked Video** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Universal compatibility |
| **ProRes 4444** | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | Professional video editing |
| **PNG Sequence** | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Frame-by-frame work, GIFs |

**WebM VP9** is excellent for video composition workflows due to its small file sizes and native alpha channel support. The SDK automatically chooses WebM VP9 as the default format when you don't specify a preference, making it ideal for most use cases including web applications and API integrations.

**Recommendation**: Use WebM VP9 for most applications. Fall back to stacked video for maximum compatibility.

```typescript
// Choose format when processing
const options1 = new RemoveBGOptions(Prefer.WEBM_VP9)      // Small files
const options2 = new RemoveBGOptions(Prefer.STACKED_VIDEO) // Universal
const options3 = new RemoveBGOptions(Prefer.MOV_PRORES)    // Professional
```

## Canvas and Sizing

The composition system automatically determines canvas size:

1. **Background dimensions** (if background is set)
2. **Explicit canvas size** (if `.canvas()` or `.setCanvas()` called)  
3. **Auto-computed from layers** (with warning)

```typescript
// Explicit canvas using static method
const comp = Composition.canvas(1920, 1080, 30.0)

// Or set canvas dimensions later (returns new composition)
const comp2 = comp.setCanvas(3840, 2160, 60.0)  // 4K 60fps
```

## Error Handling

```typescript
import { InsufficientCreditsError, ProcessingError } from '@videobgremover/sdk'

try {
  const foreground = await video.removeBackground({ client })
} catch (error) {
  if (error instanceof InsufficientCreditsError) {
    console.log('Not enough credits. Please top up your account.')
  } else if (error instanceof ProcessingError) {
    console.log(`Video processing failed: ${error.message}`)
  } else {
    console.log(`Unexpected error: ${error.message}`)
  }
}
```

## Troubleshooting

### FFmpeg Issues
- **WebM transparency not working**: Ensure FFmpeg has `libvpx-vp9` support
- **Large file sizes**: Use WebM format instead of ProRes for smaller files

### API Issues
- **401 Unauthorized**: Check your API key
- **402 Payment Required**: Top up your credits
- **Processing timeout**: Increase timeout or check video file size limits

## API Reference

### Core Classes

- **`VideoBGRemoverClient`**: API client for background removal
- **`Video`**: Video loader (file or URL)
- **`Background`**: Background sources (color, image, video)
- **`Foreground`**: Transparent video representation
- **`Composition`**: Multi-layer video composition
- **`EncoderProfile`**: Video encoding settings

### Processing Options

- **`RemoveBGOptions`**: Background removal configuration
- **`Prefer`**: Output format preferences (WEBM_VP9, STACKED_VIDEO, etc.)

### Layout & Effects

- **`Anchor`**: Positioning anchors (CENTER, TOP_LEFT, etc.)
- **`SizeMode`**: Sizing modes (CONTAIN, COVER, PX, CANVAS_PERCENT)
- **`LayerHandle`**: Layer manipulation methods

## Development

### Setup

```bash
git clone https://github.com/videobgremover/videobgremover-node.git
cd videobgremover-node
npm install
```

### Scripts

```bash
npm run build        # Build the package
npm run dev          # Watch mode for development
npm test             # Run all tests
npm run test:unit    # Run unit tests only
npm run lint         # Check code style
npm run format       # Format code
```

### Testing

```bash
# Unit tests (fast, no API calls)
npm run test:unit

# Functional tests (mock API + real FFmpeg)
npm run test:functional

# Integration tests (real API, consumes credits)
npm run test:integration
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📖 [Full Documentation](https://docs.videobgremover.com/)
- 🐙 [GitHub Repository](https://github.com/videobgremover/videobgremover-node)
- 📧 [Email Support](mailto:paul@videobgremover.com)
- 🐛 [Issue Tracker](https://github.com/videobgremover/videobgremover-node/issues)


### Animated sticker exports

Reuse a completed background-removal job with a versioned sticker format:

```ts
const receipt = await client.createStickerExport(jobId, {
  format: 'sticker-telegram-v1',
})
const result = await client.exportStatus(receipt.export_id)
```

Also supported: `sticker-whatsapp-v1`, `sticker-wechat-v1`, `sticker-discord-v1`.
Sticker formats own their dimensions, duration and compression budget with 10% size headroom.
The helper defaults to CPU; set `use_gpu: true` explicitly for GPU routing.
Poll until completed before using `output_url`. Completed results include a validation receipt and `poster_url`.
