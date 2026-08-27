## [1.3.2](https://github.com/ixoworld/ixo-matrix-crdt/compare/v1.3.1...v1.3.2) (2026-08-27)


### Bug Fixes

* apply streamed catch-up updates chronologically, not newest-first ([490e3e9](https://github.com/ixoworld/ixo-matrix-crdt/commit/490e3e9ca34bdac63455ba42573f455fc093c023)), closes [#9](https://github.com/ixoworld/ixo-matrix-crdt/issues/9)

## [1.3.1](https://github.com/ixoworld/ixo-matrix-crdt/compare/v1.3.0...v1.3.1) (2026-08-11)


### Bug Fixes

* **writer:** restore auto-join and immediate retry on forbidden writes ([b5b0cec](https://github.com/ixoworld/ixo-matrix-crdt/commit/b5b0cec7111acdb774ab854ada16ab05d6c6eecb))


### Performance Improvements

* stream catch-up events into the doc instead of accumulating history ([d1ce39f](https://github.com/ixoworld/ixo-matrix-crdt/commit/d1ce39f6bd5f0c2a3d599f2a8e5f83e6ced23324))

# [1.3.0](https://github.com/ixoworld/ixo-matrix-crdt/compare/v1.2.5...v1.3.0) (2026-07-30)


### Bug Fixes

* **test:** make test setup loadable and keep crypto.subtle available ([90f25aa](https://github.com/ixoworld/ixo-matrix-crdt/commit/90f25aad58a5304c7f7b0efb999bdb428c1cc3e1))
* **webrtc:** copy crypto inputs into ArrayBuffers ([223df7c](https://github.com/ixoworld/ixo-matrix-crdt/commit/223df7cec1dc4a6a903d660a4aa31f50fd95d4c7))


### Features

* **cloning:** accept encoded document updates ([cf518a2](https://github.com/ixoworld/ixo-matrix-crdt/commit/cf518a239c772f186b98f3c070c81b84c31b71a0))
* **history:** add durable Matrix run event log ([5e2876c](https://github.com/ixoworld/ixo-matrix-crdt/commit/5e2876ce96bfc69e184efd709b004d557259b4ec))
* **snapshots:** media-backed snapshots on a new event type, write path off by default ([c69ac01](https://github.com/ixoworld/ixo-matrix-crdt/commit/c69ac01f3af2610210627b4c80f3f09dfca5712e))


### Performance Improvements

* **snapshots:** resolve room encryption lazily instead of on every init ([31bba41](https://github.com/ixoworld/ixo-matrix-crdt/commit/31bba41d417248643bc787e546313c8e1a84ffbf))
* **snapshots:** skip the media fetch when a newer readable snapshot exists ([6b6121b](https://github.com/ixoworld/ixo-matrix-crdt/commit/6b6121bd41b4dc38c0daf574a65980893f19a9c0))

## [1.2.5](https://github.com/ixoworld/ixo-matrix-crdt/compare/v1.2.4...v1.2.5) (2026-06-03)


### Bug Fixes

* bump ([21c4217](https://github.com/ixoworld/ixo-matrix-crdt/commit/21c4217491ec64e1f44a1049338c75bb27054164))

## [1.2.4](https://github.com/ixoworld/ixo-matrix-crdt/compare/v1.2.3...v1.2.4) (2026-06-03)


### Bug Fixes

* remove prepare script causing publish loop ([4dc9794](https://github.com/ixoworld/ixo-matrix-crdt/commit/4dc979467d335cf4838390f2dad378e8511ad055))

## [1.2.3](https://github.com/ixoworld/ixo-matrix-crdt/compare/v1.2.2...v1.2.3) (2026-06-03)


### Bug Fixes

* bump ([4865545](https://github.com/ixoworld/ixo-matrix-crdt/commit/48655450fe921269d50ccfb72dc8c985deedea8e))

## [1.2.2](https://github.com/ixoworld/ixo-matrix-crdt/compare/v1.2.1...v1.2.2) (2026-06-03)


### Bug Fixes

* default-import lodash so the ESM build resolves throttle under native Node ESM ([b5d902d](https://github.com/ixoworld/ixo-matrix-crdt/commit/b5d902d8bff80bbf5f7b36074e2e3c3ee62cd4d5))

## [1.2.1](https://github.com/ixoworld/ixo-matrix-crdt/compare/v1.2.0...v1.2.1) (2026-05-04)


### Bug Fixes

* resolve race condition issue with announce ([30128a7](https://github.com/ixoworld/ixo-matrix-crdt/commit/30128a7d86c1cb7a4feb8cf588ebf41a4ca67288))

# [1.2.0](https://github.com/ixoworld/ixo-matrix-crdt/compare/v1.1.0...v1.2.0) (2026-02-17)


### Features

* add cloneDocument utility for instant page cloning ([4dfc2f6](https://github.com/ixoworld/ixo-matrix-crdt/commit/4dfc2f661d1f81042573ffcc8fb1f05cc50e19b9))

# [1.1.0](https://github.com/ixoworld/ixo-matrix-crdt/compare/v1.0.4...v1.1.0) (2025-11-06)


### Bug Fixes

* fix lockfile ([9b9ad65](https://github.com/ixoworld/ixo-matrix-crdt/commit/9b9ad65d00cd13c71fd304cdf846c5498d94f7f9))


### Features

* add commonjs support also, dual esm and commonjs support ([b1fdf5e](https://github.com/ixoworld/ixo-matrix-crdt/commit/b1fdf5e61833b223f739b5d13560bc38df0f8704))

## [1.0.4](https://github.com/ixoworld/ixo-matrix-crdt/compare/v1.0.3...v1.0.4) (2025-10-27)


### Bug Fixes

* add max retry attempts for forbidden writes in ThrottledMatrixWriter ([9c5216d](https://github.com/ixoworld/ixo-matrix-crdt/commit/9c5216dbbcd8872e7ed285aec8bb54f9968c5365))

## [1.0.3](https://github.com/ixoworld/ixo-matrix-crdt/compare/v1.0.2...v1.0.3) (2025-09-10)


### Bug Fixes

* package config ([7fd1dd5](https://github.com/ixoworld/ixo-matrix-crdt/commit/7fd1dd54f6a685298747acb3cb3005a924f7323c))

## [1.0.2](https://github.com/ixoworld/ixo-matrix-crdt/compare/v1.0.1...v1.0.2) (2025-09-10)


### Bug Fixes

* privacy of package ([e0b7270](https://github.com/ixoworld/ixo-matrix-crdt/commit/e0b7270f850c03405ad6cb01ec45637de1ca7b44))

## [1.0.1](https://github.com/ixoworld/ixo-matrix-crdt/compare/v1.0.0...v1.0.1) (2025-09-10)


### Bug Fixes

* throw better error message ([49b106a](https://github.com/ixoworld/ixo-matrix-crdt/commit/49b106a1340f4914bac9e7e20a2c7624a722e6a0))

# 1.0.0 (2025-09-10)


### Bug Fixes

* remove Room.timeline event listener to prevent conflicts in read-write mode ([e54140d](https://github.com/ixoworld/ixo-matrix-crdt/commit/e54140d41504fc880623164c431b018b1f8ef174))
