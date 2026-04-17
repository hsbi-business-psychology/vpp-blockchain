import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ethers } from 'ethers'
import {
  UserPlus,
  UserMinus,
  Loader2,
  Info,
  ShieldCheck,
  Pencil,
  Check,
  X,
  Server,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useApi } from '@/hooks/use-api'
import type { AdminEntry } from '@/hooks/use-api'
import { ApiRequestError } from '@vpp/shared'

interface RoleManagementProps {
  walletAddress: string
  sign: (message: string) => Promise<string>
}

const MAX_LABEL_LENGTH = 64

export function RoleManagement({ walletAddress, sign }: RoleManagementProps) {
  const { t } = useTranslation()
  const { addAdmin, removeAdmin, getAdmins, setAdminLabel } = useApi()
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [admins, setAdmins] = useState<AdminEntry[]>([])
  const [loadingAdmins, setLoadingAdmins] = useState(true)

  // Per-row inline edit state. We track at most one edit at a time so the
  // user can't accidentally start editing a second row before the first
  // PUT has resolved.
  const [editingAddress, setEditingAddress] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingLabel, setSavingLabel] = useState(false)

  const fetchAdmins = useCallback(async () => {
    setLoadingAdmins(true)
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const message = `List admins by ${walletAddress} at ${timestamp}`
      const signature = await sign(message)
      const adminList = await getAdmins(signature, message)
      setAdmins(adminList)
    } catch (err) {
      console.error('Failed to fetch admins:', err)
    } finally {
      setLoadingAdmins(false)
    }
  }, [getAdmins, walletAddress, sign])

  useEffect(() => {
    fetchAdmins()
  }, [fetchAdmins])

  const handleAddAdmin = async () => {
    if (!ethers.isAddress(address)) {
      toast.error(t('admin.roles.errorAdd'))
      return
    }
    setLoading(true)
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const message = `Add admin ${address} by ${walletAddress} at ${timestamp}`
      const signature = await sign(message)

      await addAdmin(address, signature, message)
      toast.success(t('admin.roles.successAdd'))
      setAddress('')
      await fetchAdmins()
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : t('admin.roles.errorAdd')
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveAdmin = async (addr: string) => {
    setLoading(true)
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const message = `Remove admin ${addr} by ${walletAddress} at ${timestamp}`
      const signature = await sign(message)

      await removeAdmin(addr, signature, message)
      toast.success(t('admin.roles.successRemove'))
      await fetchAdmins()
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : t('admin.roles.errorRemove')
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const startEditing = (entry: AdminEntry) => {
    setEditingAddress(entry.address)
    setEditValue(entry.label ?? '')
  }

  const cancelEditing = () => {
    setEditingAddress(null)
    setEditValue('')
  }

  const saveLabel = async (addr: string) => {
    setSavingLabel(true)
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const message = `Set admin label ${addr} at ${timestamp}`
      const signature = await sign(message)

      const result = await setAdminLabel(addr, editValue, signature, message)
      setAdmins((prev) => prev.map((a) => (a.address === addr ? { ...a, label: result.label } : a)))
      toast.success(t('admin.roles.successLabel'))
      cancelEditing()
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : t('admin.roles.errorLabel')
      toast.error(msg)
    } finally {
      setSavingLabel(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">{t('admin.roles.title')}</CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t('admin.roles.infoLabel')}
                >
                  <Info className="size-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-sm">
                {t('admin.roles.infoTip')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <CardDescription>{t('admin.roles.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder={t('admin.roles.placeholder')}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="font-mono sm:flex-1"
            aria-label={t('admin.roles.placeholder')}
            autoComplete="off"
          />
          <div className="flex gap-2">
            <Button
              onClick={handleAddAdmin}
              disabled={loading || !address}
              className="flex-1 sm:flex-none"
            >
              {loading ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 size-4" />
              )}
              {t('admin.roles.addAdmin')}
            </Button>
          </div>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold text-muted-foreground">
            {t('admin.roles.currentAdmins')}
          </h4>
          {loadingAdmins ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('admin.roles.checking')}
            </div>
          ) : admins.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{t('admin.roles.noAdmins')}</p>
          ) : (
            <ul className="space-y-2">
              {admins.map((entry) => {
                const isYou = entry.address.toLowerCase() === walletAddress.toLowerCase()
                const isEditing = editingAddress === entry.address
                const canRemove = !entry.isMinter && !isYou

                return (
                  <li
                    key={entry.address}
                    className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      {entry.isMinter ? (
                        <Server
                          className="mt-1 size-4 shrink-0 text-amber-500 dark:text-amber-400"
                          aria-hidden="true"
                        />
                      ) : (
                        <ShieldCheck
                          className="mt-1 size-4 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              maxLength={MAX_LABEL_LENGTH}
                              placeholder={t('admin.roles.namePlaceholder')}
                              className="h-8 sm:flex-1"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void saveLabel(entry.address)
                                if (e.key === 'Escape') cancelEditing()
                              }}
                              aria-label={t('admin.roles.namePlaceholder')}
                            />
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => void saveLabel(entry.address)}
                                disabled={savingLabel}
                                aria-label={t('admin.roles.saveName')}
                              >
                                {savingLabel ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Check className="size-3" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={cancelEditing}
                                disabled={savingLabel}
                                aria-label={t('admin.roles.cancelName')}
                              >
                                <X className="size-3" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={
                                entry.label
                                  ? 'truncate text-sm font-medium'
                                  : 'truncate text-sm italic text-muted-foreground'
                              }
                            >
                              {entry.label ?? t('admin.roles.unnamed')}
                            </span>
                            <button
                              onClick={() => startEditing(entry)}
                              className="text-muted-foreground hover:text-foreground"
                              aria-label={t('admin.roles.editName')}
                              title={t('admin.roles.editName')}
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            {isYou && (
                              <Badge variant="secondary" className="shrink-0 text-xs">
                                {t('admin.roles.you')}
                              </Badge>
                            )}
                            {entry.isMinter && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="outline"
                                      className="shrink-0 cursor-help border-amber-500/50 bg-amber-50 text-xs text-amber-700 dark:border-amber-400/50 dark:bg-amber-950/40 dark:text-amber-300"
                                    >
                                      {t('admin.roles.minterBadge')}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs text-sm">
                                    {t('admin.roles.minterTooltip')}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        )}
                        <span className="block truncate font-mono text-xs text-muted-foreground">
                          {entry.address}
                        </span>
                      </div>
                    </div>

                    {canRemove && !isEditing && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveAdmin(entry.address)}
                        disabled={loading}
                        className="shrink-0 text-destructive hover:text-destructive"
                      >
                        <UserMinus className="mr-1 size-4" />
                        {t('admin.roles.removeAdmin')}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
