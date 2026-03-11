import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Check, Download, Eye, EyeOff, Plus, Upload, Trash2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useWallet } from '@/hooks/use-wallet'
import { isValidPrivateKey } from '@/lib/wallet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success(t('common.copied'))
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="ghost" size="icon" onClick={handleCopy} className="size-8 shrink-0">
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  )
}

export default function WalletPage() {
  const { t } = useTranslation()
  const { wallet, hasWallet, create, importKey, remove, downloadKey } = useWallet()
  const [importValue, setImportValue] = useState('')
  const [importError, setImportError] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const handleCreate = () => {
    create()
    toast.success(t('wallet.create.success'))
  }

  const handleImport = () => {
    setImportError('')
    if (!isValidPrivateKey(importValue)) {
      setImportError(t('wallet.import.error'))
      return
    }
    try {
      importKey(importValue)
      setImportValue('')
      toast.success(t('wallet.create.success'))
    } catch {
      setImportError(t('wallet.import.error'))
    }
  }

  const handleDelete = () => {
    remove()
    setDeleteOpen(false)
    setShowKey(false)
    toast.success(t('wallet.delete.success'))
  }

  if (!hasWallet) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold">{t('wallet.title')}</h1>
        <p className="text-muted-foreground">{t('wallet.noWallet')}</p>

        <Tabs defaultValue="create" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="create" className="flex-1">
              <Plus className="mr-2 size-4" />
              {t('wallet.create.title')}
            </TabsTrigger>
            <TabsTrigger value="import" className="flex-1">
              <Upload className="mr-2 size-4" />
              {t('wallet.import.title')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle>{t('wallet.create.title')}</CardTitle>
                <CardDescription>{t('wallet.create.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleCreate} className="w-full">
                  <Plus className="mr-2 size-4" />
                  {t('wallet.create.button')}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="import">
            <Card>
              <CardHeader>
                <CardTitle>{t('wallet.import.title')}</CardTitle>
                <CardDescription>{t('wallet.import.description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="private-key">Private Key</Label>
                  <Input
                    id="private-key"
                    type="password"
                    placeholder={t('wallet.import.placeholder')}
                    value={importValue}
                    onChange={(e) => {
                      setImportValue(e.target.value)
                      setImportError('')
                    }}
                  />
                  {importError && <p className="text-sm text-destructive">{importError}</p>}
                </div>
                <Button onClick={handleImport} disabled={!importValue} className="w-full">
                  <Upload className="mr-2 size-4" />
                  {t('wallet.import.button')}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t('wallet.title')}</h1>

      {/* Address */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('wallet.info.address')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
            <code className="flex-1 truncate text-sm">{wallet!.address}</code>
            <CopyButton text={wallet!.address} />
          </div>
        </CardContent>
      </Card>

      {/* Private Key */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('wallet.info.privateKey')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>{t('wallet.info.warning')}</AlertDescription>
          </Alert>

          <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
            <code className="flex-1 truncate text-sm">
              {showKey ? wallet!.privateKey : '•'.repeat(64)}
            </code>
            <CopyButton text={wallet!.privateKey} />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" size="sm" onClick={() => setShowKey(!showKey)} className="flex-1">
              {showKey ? (
                <>
                  <EyeOff className="mr-2 size-4" />
                  {t('wallet.info.hideKey')}
                </>
              ) : (
                <>
                  <Eye className="mr-2 size-4" />
                  {t('wallet.info.showKey')}
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={downloadKey} className="flex-1">
              <Download className="mr-2 size-4" />
              {t('wallet.info.downloadKey')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Delete */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive" className="w-full">
            <Trash2 className="mr-2 size-4" />
            {t('wallet.delete.button')}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('wallet.delete.title')}</DialogTitle>
            <DialogDescription>{t('wallet.delete.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
