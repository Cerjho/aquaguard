"""
AquaGuard Detection Engine - Crash-Proof Watchdog

This module ensures the detection engine NEVER stops running.
Critical for life-safety drowning detection system.

Features:
- Auto-restart on crash with exponential backoff
- Health monitoring and alerting
- Graceful shutdown handling
- Process supervision
"""
import logging
import os
import time
import signal

logger = logging.getLogger(__name__)

# Maximum consecutive failures before alerting
MAX_CONSECUTIVE_FAILURES = 3

# Restart backoff settings
INITIAL_BACKOFF_SECONDS = 1
MAX_BACKOFF_SECONDS = 60
BACKOFF_MULTIPLIER = 2


class DetectionEngineWatchdog:
    """Supervises detection engine and restarts on crash."""

    def __init__(self):
        self.consecutive_failures = 0
        self.total_restarts = 0
        self.start_time = time.time()
        self.last_success_time = None
        self.shutdown_requested = False

        # Register signal handlers
        signal.signal(signal.SIGINT, self._handle_shutdown)
        signal.signal(signal.SIGTERM, self._handle_shutdown)

    def _handle_shutdown(self, signum, frame):
        """Handle graceful shutdown signals."""
        logger.info("Shutdown signal received (signal %d)", signum)
        self.shutdown_requested = True
        # Interrupt blocking loops so main_func can reach its cleanup path.
        raise KeyboardInterrupt()

    def _calculate_backoff(self):
        """Calculate backoff time with exponential increase."""
        backoff = min(
            INITIAL_BACKOFF_SECONDS * (BACKOFF_MULTIPLIER ** self.consecutive_failures),
            MAX_BACKOFF_SECONDS
        )
        return backoff

    def run_supervised(self, main_func):
        """
        Run the main detection function with supervision.

        Args:
            main_func: The main() function to supervise
        """
        logger.info(
            "=== AquaGuard Detection Engine Watchdog Starting ==="
        )
        logger.info("Process PID: %d", os.getpid())
        logger.info("Auto-restart enabled - system will NEVER stop")

        while not self.shutdown_requested:
            try:
                logger.info(
                    "Starting detection engine (restart #%d, failures: %d)",
                    self.total_restarts,
                    self.consecutive_failures
                )

                # Run the main detection loop
                main_func()

                # If we get here, main() exited normally
                logger.info("Detection engine exited normally")
                self.last_success_time = time.time()
                self.consecutive_failures = 0

                # Normal exit - only restart if not shutdown
                if not self.shutdown_requested:
                    logger.warning(
                        "Detection engine stopped but no shutdown requested - restarting..."
                    )
                    time.sleep(5)
                    self.total_restarts += 1
                else:
                    logger.info("Shutdown requested - stopping watchdog")
                    break

            except KeyboardInterrupt:
                logger.info("KeyboardInterrupt - initiating shutdown")
                self.shutdown_requested = True
                break

            except Exception as exc:
                # CRITICAL: Never let exceptions crash the watchdog!
                self.consecutive_failures += 1
                self.total_restarts += 1

                logger.error(
                    "🚨 CRITICAL: Detection engine crashed! "
                    "(Consecutive failures: %d, Total restarts: %d)",
                    self.consecutive_failures,
                    self.total_restarts,
                    exc_info=True
                )

                # Alert if too many failures
                if self.consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    logger.critical(
                        "🚨🚨🚨 CRITICAL SYSTEM FAILURE 🚨🚨🚨\n"
                        "%d consecutive crashes detected!\n"
                        "Last error: %s\n"
                        "System will continue trying to restart...",
                        self.consecutive_failures,
                        exc
                    )
                    # TODO: Send email/SMS alert to admin
                    # TODO: Trigger MQTT critical alert

                # Calculate backoff before restart
                backoff = self._calculate_backoff()
                logger.info(
                    "Restarting in %.1f seconds (backoff strategy)...",
                    backoff
                )
                time.sleep(backoff)

        # Watchdog shutdown
        uptime = time.time() - self.start_time
        logger.info(
            "=== AquaGuard Detection Engine Watchdog Stopped ==="
        )
        logger.info("Total uptime: %.1f seconds", uptime)
        logger.info("Total restarts: %d", self.total_restarts)
        logger.info("Goodbye.")


def run_with_watchdog(main_func):
    """
    Run detection engine with watchdog supervision.

    Usage:
        from detection_engine.watchdog import run_with_watchdog

        if __name__ == '__main__':
            run_with_watchdog(main)
    """
    watchdog = DetectionEngineWatchdog()
    watchdog.run_supervised(main_func)


if __name__ == '__main__':
    # Test the watchdog with a crashing function
    def test_crash():
        import random
        for i in range(10):
            print(f"Running iteration {i}")
            time.sleep(1)
            if random.random() < 0.3:
                raise RuntimeError(f"Random crash at iteration {i}")
        print("Test completed successfully!")

    run_with_watchdog(test_crash)
