import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface WechatQrModalProps {
  open: boolean;
  onClose: () => void;
}

export function WechatQrModal({ open, onClose }: WechatQrModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>加微信咨询</DialogTitle>
          <DialogDescription>
            该项目为实战演示项目，扫码添加 小Q 微信提升额度体验
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center py-4">
          <img
            src="/wechat-qr.jpg"
            alt="微信二维码"
            className="h-64 w-64 rounded-lg border border-border object-cover"
          />
        </div>

        <div className="text-center text-xs text-muted-foreground">
          预计回复时间：工作日 1-2 小时
        </div>
      </DialogContent>
    </Dialog>
  );
}
