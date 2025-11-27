# Changelog

All notable changes to the VideoBGRemover Node.js SDK will be documented in this file.

## [0.1.7] - 2025-11-27

### Added
- **Matte composition support**: Added `matte` parameter to `fromVideoAndMask()` for soft alpha blending vs binary masking

## [0.1.6] - 2025-11-12

### Removed
- Removed `ResultResponse` interface - deprecated endpoint no longer exists in API

## [0.1.5] - 2025-11-01

### Added
- Model selection support: choose between videobgremover-original and videobgremover-light via RemoveBGOptions

## [0.1.4] - 2025-10-17

### Fixed
- Image background URLs now download to local temp files for faster composition performance

## [0.1.2] - 2025-10-03

### Added
- **Webhook support**: Added `webhook_url` parameter to `startJob()` method
- **Webhook delivery history**: New `webhookDeliveries()` method for checking delivery status
- **Options object pattern**: Improved API design for `removeBackground()` with cleaner parameter passing

## [0.1.0] - 2025-09-27

### Added
- Initial release of VideoBGRemover Node.js SDK
- Video background removal with AI
- Multi-layer video composition system
- Support for transparent video formats (WebM VP9, ProRes, Stacked Video, PNG Sequence)
- FFmpeg integration for video processing

[0.1.2]: https://github.com/videobgremover/videobgremover-node/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/videobgremover/videobgremover-node/compare/v0.1.0...v0.1.1
