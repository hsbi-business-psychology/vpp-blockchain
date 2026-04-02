import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ethers } from 'ethers'
import { UserPlus, UserMinus, Loader2, Info, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useApi } from '@/hooks/use-api'
import { ApiRequestError } from '@vpp/shared'

interface RoleManagementProps {
  walletAddress: string
  sign: (message: string) => Promise<string>
}

export function RoleManagement({ walletAddress, sign }: RoleManagementProps) {
  const { t } = useTranslation()
  const { addAdmin, removeAdmin, getAdmins } = useApi()
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [admins, setAdmins] = useState<string[]>([])
  const [loadingAdmins, setLoadingAdmins] = useState(true)

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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">{t('admin.roles.title')}</CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground" aria-label="Info">
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
            <div className="space-y-2">
              {admins.map((addr) => (
                <div
                  key={addr}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <ShieldCheck className="size-4 shrink-0 text-primary" />
                    <span className="truncate font-mono text-sm">{addr}</span>
                    {addr.toLowerCase() === walletAddress.toLowerCase() && (
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {t('admin.roles.you')}
                      </Badge>
                    )}
                  </div>
                  {addr.toLowerCase() !== walletAddress.toLowerCase() && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveAdmin(addr)}
                      disabled={loading}
                      className="shrink-0 text-destructive hover:text-destructive"
                    >
                      <UserMinus className="mr-1 size-4" />
                      {t('admin.roles.removeAdmin')}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
