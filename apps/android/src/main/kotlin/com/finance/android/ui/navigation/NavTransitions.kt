// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.navigation

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.navigation.NavBackStackEntry

/**
 * Material 3 shared-axis navigation transitions for the Finance app.
 *
 * Follows the Material Motion guidelines for forward/backward navigation:
 * - **Forward (push):** slide in from the right + fade in
 * - **Backward (pop):** slide out to the right + fade out
 * - **Tab switch:** crossfade only (no directional slide)
 *
 * @see <a href="https://m3.material.io/styles/motion/transitions/transition-patterns">
 *   Material 3 Transition Patterns</a>
 */
object NavTransitions {

    /** Standard animation duration in milliseconds. */
    private const val DURATION_MS = 300

    /** Slide offset as a fraction of the container width. */
    private const val SLIDE_OFFSET_FRACTION = 0.25

    // ── Forward transitions (entering a new screen) ─────────────────

    /**
     * Enter transition for pushing a new screen onto the back stack.
     * Slides in from the right with a fade-in.
     */
    val enterTransition: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition = {
        slideInHorizontally(
            initialOffsetX = { (it * SLIDE_OFFSET_FRACTION).toInt() },
            animationSpec = tween(DURATION_MS),
        ) + fadeIn(animationSpec = tween(DURATION_MS))
    }

    /**
     * Exit transition for the screen being replaced when pushing forward.
     * Slides out to the left with a fade-out.
     */
    val exitTransition: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition = {
        slideOutHorizontally(
            targetOffsetX = { -(it * SLIDE_OFFSET_FRACTION).toInt() },
            animationSpec = tween(DURATION_MS),
        ) + fadeOut(animationSpec = tween(DURATION_MS))
    }

    // ── Pop transitions (going back) ────────────────────────────────

    /**
     * Enter transition for the screen being revealed on back press.
     * Slides in from the left with a fade-in.
     */
    val popEnterTransition: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition = {
        slideInHorizontally(
            initialOffsetX = { -(it * SLIDE_OFFSET_FRACTION).toInt() },
            animationSpec = tween(DURATION_MS),
        ) + fadeIn(animationSpec = tween(DURATION_MS))
    }

    /**
     * Exit transition for the screen being popped off the back stack.
     * Slides out to the right with a fade-out.
     */
    val popExitTransition: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition = {
        slideOutHorizontally(
            targetOffsetX = { (it * SLIDE_OFFSET_FRACTION).toInt() },
            animationSpec = tween(DURATION_MS),
        ) + fadeOut(animationSpec = tween(DURATION_MS))
    }

    // ── Tab transitions (crossfade only, no slide) ──────────────────

    /**
     * Crossfade enter for tab switches — no directional hint since
     * tabs are lateral peers, not hierarchical.
     */
    val tabEnterTransition: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition = {
        fadeIn(animationSpec = tween(DURATION_MS))
    }

    /**
     * Crossfade exit for tab switches.
     */
    val tabExitTransition: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition = {
        fadeOut(animationSpec = tween(DURATION_MS))
    }

    // ── Reduced-motion transitions (accessibility) ──────────────────

    /**
     * Crossfade-only enter used when the user has enabled the
     * **reduced animations** preference (#3717). Replaces directional
     * slides to respect WCAG 2.2 (2.3.3 Animation from Interactions).
     */
    val reducedEnterTransition: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition = {
        fadeIn(animationSpec = tween(DURATION_MS))
    }

    /**
     * Crossfade-only exit counterpart to [reducedEnterTransition].
     */
    val reducedExitTransition: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition = {
        fadeOut(animationSpec = tween(DURATION_MS))
    }
}
