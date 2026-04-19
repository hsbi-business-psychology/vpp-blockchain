/**
 * @module balance-monitor
 *
 * Polls the minter wallet balance on a fixed interval and emits a
 * structured `MINTER_BALANCE_LOW` log line at warn level when the
 * balance drops below `WARN_BALANCE_WEI` (default: 5× `MIN_BALANCE_WEI`,
 * see `services/blockchain.ts` and audit F2.4).
 *
 * The log line is intentionally greppable so the operator side can wire
 * it into whatever paging stack Plesk gives them — the V2 production
 * setup uses a `cron.hourly` script that mails the owner the moment
 * the keyword appears in the Passenger log:
 *
 * ```bash
 * # /etc/cron.hourly/vpp-balance-warn
 * LOG=/var/www/vhosts/vpstunden.hsbi.de/logs/access_log
 * MARKER=/tmp/vpp-balance-warned
 *
 * if [ ! -f "$MARKER" ] && grep -q 'MINTER_BALANCE_LOW' "$LOG"; then
 *   mail -s '[VPP] Minter wallet low' owner@hsbi.de < "$LOG" \
 *     | head -n 200 \
 *     && touch "$MARKER"
 * fi
 * ```
 *
 * Reset-on-refill is documented in `docs/runbooks/eth-refill.md`
 * (delete `/tmp/vpp-balance-warned`).
 *
 * The monitor is intentionally cooldown-rate-limited inside the process
 * too — a flaky RPC that briefly returns 0 should not produce a log
 * spam storm; we cap warnings at one per `WARN_COOLDOWN_MS` per
 * process.
 */
import { ethers } from 'ethers'
import { config } from '../config.js'
import { logger } from '../lib/logger.js'
import {
  MIN_BALANCE_WEI,
  WARN_BALANCE_WEI,
  getMinterAddress,
  getMinterBalance,
} from './blockchain.js'

const WARN_COOLDOWN_MS = 24 * 60 * 60 * 1000

let lastWarningSentAt = 0
let intervalHandle: NodeJS.Timeout | null = null

/**
 * One-shot balance check. Logs a `MINTER_BALANCE_LOW` warn line when
 * the balance has dropped below the warn threshold AND the cooldown
 * has elapsed since the last warning; everything else is a debug-level
 * heartbeat.
 *
 * Errors during the balance fetch are logged at warn level (with the
 * cause) but never thrown — the monitor must not crash the process.
 */
export async function checkBalanceAndWarn(): Promise<void> {
  try {
    const balance = await getMinterBalance()
    const balanceEth = ethers.formatEther(balance)

    if (balance < WARN_BALANCE_WEI) {
      const now = Date.now()
      if (now - lastWarningSentAt >= WARN_COOLDOWN_MS) {
        logger.warn(
          {
            balanceEth,
            warnThresholdEth: ethers.formatEther(WARN_BALANCE_WEI),
            minThresholdEth: ethers.formatEther(MIN_BALANCE_WEI),
            minterAddress: getMinterAddress(),
            severity: 'OPERATIONAL',
            action: 'TOP_UP_REQUIRED',
          },
          'MINTER_BALANCE_LOW: backend wallet needs ETH refill — see docs/runbooks/eth-refill.md',
        )
        lastWarningSentAt = now
      }
    } else {
      logger.debug({ balanceEth, minterAddress: getMinterAddress() }, 'minter balance ok')
    }
  } catch (err) {
    logger.warn({ err }, 'balance-monitor: failed to fetch minter balance')
  }
}

/**
 * Start a recurring balance check. Returns a stop function so callers
 * (mainly the graceful-shutdown handler in `server.ts`) can clear the
 * timer cleanly. Idempotent: a second call is a no-op.
 *
 * Uses `unref()` so the timer never blocks process exit.
 */
export function startBalanceMonitor(): () => void {
  if (intervalHandle) return stopBalanceMonitor

  const intervalMs = config.balanceMonitorIntervalMs
  if (intervalMs <= 0) {
    logger.info('balance-monitor disabled (BALANCE_MONITOR_INTERVAL_MS <= 0)')
    return () => undefined
  }

  // Boot-time check first so an operator restarting the worker into a
  // low-balance state gets immediate visibility instead of waiting an
  // hour for the first tick.
  void checkBalanceAndWarn()

  intervalHandle = setInterval(() => {
    void checkBalanceAndWarn()
  }, intervalMs)
  intervalHandle.unref()

  logger.info(
    {
      intervalMs,
      warnThresholdEth: ethers.formatEther(WARN_BALANCE_WEI),
      minThresholdEth: ethers.formatEther(MIN_BALANCE_WEI),
    },
    'balance-monitor started',
  )

  return stopBalanceMonitor
}

export function stopBalanceMonitor(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
    logger.info('balance-monitor stopped')
  }
}

/** Test hook: resets the cooldown so the next call always emits a warning. */
export function _resetBalanceMonitorForTest(): void {
  lastWarningSentAt = 0
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}
