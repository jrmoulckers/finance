// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.ai

import java.util.logging.Logger

/**
 * Windows ML / ONNX Runtime adapter for on-device balance prediction.
 *
 * This class is the landing spot for a learned short-horizon balance model
 * exported to ONNX and executed locally via the Windows ML APIs (or the
 * ONNX Runtime JNI bindings). Keeping inference behind [BalancePredictor]
 * means the rest of the widget stack already targets this adapter — only the
 * native session wiring is outstanding.
 *
 * ## Current behaviour
 *
 * Until the native ONNX session is wired (see the toolchain TODO below), this
 * adapter **delegates to a deterministic [fallback]** so the widget keeps
 * working in unit tests and in unpackaged dev builds. The delegation is
 * transparent: callers always receive a valid [BalancePrediction]. The
 * [modelId] reflects whichever path served the prediction so diagnostics can
 * tell the heuristic and the (future) ONNX model apart.
 *
 * ## Why a stub
 *
 * Loading an `.onnx` model and creating an inference session requires the
 * Windows App SDK / Windows ML runtime (or the `onnxruntime` native library)
 * to be present and packaged with the MSIX. Those native dependencies cannot
 * be added in a pure JVM/Compose-Desktop CI lane without the Visual Studio +
 * Windows SDK toolchain, so the session creation is gated behind a human
 * toolchain step rather than committed half-wired.
 *
 * @property modelAssetPath Path the packaged `.onnx` model would load from.
 * @property fallback Deterministic predictor used until the ONNX session is live.
 */
class OnnxBalancePredictor(
    private val modelAssetPath: String = DEFAULT_MODEL_ASSET,
    private val fallback: BalancePredictor = HeuristicBalancePredictor(),
) : BalancePredictor {

    private val logger: Logger = Logger.getLogger(OnnxBalancePredictor::class.java.name)

    /**
     * Whether a real ONNX inference session is available.
     *
     * Returns `false` today because the native session is not yet created.
     * Once the toolchain TODO below is resolved this should reflect a
     * successfully initialised Windows ML / ONNX Runtime session.
     */
    val isNativeSessionAvailable: Boolean
        get() = nativeSession != null

    // TODO(human): Initialise a Windows ML / ONNX Runtime inference session
    //  from `modelAssetPath`. This requires the Windows App SDK / Windows ML
    //  runtime (or the onnxruntime native lib) to be packaged with the MSIX,
    //  which needs the Visual Studio + Windows SDK toolchain unavailable in the
    //  pure-JVM CI lane. Wire `nativeSession` to the created session and map
    //  PredictionInput -> input tensor -> output tensor in `runNativeInference`.
    private val nativeSession: Any? = null

    override val modelId: String
        get() = if (isNativeSessionAvailable) NATIVE_MODEL_ID else fallback.modelId

    override fun predict(input: PredictionInput): BalancePrediction {
        val native = runNativeInference(input)
        if (native != null) return native

        logger.fine(
            "ONNX session unavailable (model=$modelAssetPath) — " +
                "serving deterministic fallback prediction.",
        )
        return fallback.predict(input)
    }

    /**
     * Runs native ONNX inference if a session is available.
     *
     * Returns `null` until the native session is wired (see toolchain TODO),
     * signalling [predict] to use the deterministic [fallback].
     */
    private fun runNativeInference(input: PredictionInput): BalancePrediction? {
        val session = nativeSession ?: return null
        // TODO(human): Convert `input` to the model's input tensor, run
        //  `session` inference, and map the output tensor to a BalancePrediction
        //  tagged with NATIVE_MODEL_ID. Requires the packaged ONNX runtime.
        @Suppress("UNUSED_EXPRESSION")
        session
        return null
    }

    companion object {
        const val NATIVE_MODEL_ID = "onnx-balance-forecast-v1"

        /** Relative path the model would be packaged at inside the MSIX. */
        const val DEFAULT_MODEL_ASSET = "models/balance-forecast.onnx"
    }
}
