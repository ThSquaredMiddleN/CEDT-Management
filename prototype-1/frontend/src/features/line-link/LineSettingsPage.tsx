import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, MessageCircle } from "lucide-react";
import { useState } from "react";
import { getLineStatus, unlinkLine } from "@/api/endpoints";
import { qk } from "@/api/queryKeys";
import { Spinner } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Bilingual, StatusCard } from "./LineStatusUi";

// Bangkok time for the linked date. The Thai line uses the Thai calendar (th-TH), the English line uses en-GB.
const linkedDate = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(iso));

/** Signed-in users (students and staff) see their LINE link state here. Linking starts in LINE, not on this page. */
export function LineSettingsPage() {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const status = useQuery({
    queryKey: qk.lineStatus,
    queryFn: getLineStatus,
    refetchOnWindowFocus: false,
  });

  const unlink = useMutation({
    mutationFn: unlinkLine,
    onSuccess: () => {
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: qk.lineStatus });
    },
  });

  let content;
  if (status.isPending) {
    content = (
      <div role="status" aria-label="Loading LINE status">
        <Spinner className="size-6" />
      </div>
    );
  } else if (status.isError) {
    content = (
      <StatusCard
        icon={<AlertCircle className="size-5" />}
        title={
          <>
            <span>โหลดสถานะ LINE ไม่สำเร็จ</span>
            <span className="text-sm font-normal text-neutral-500">Couldn't load LINE status</span>
          </>
        }
      >
        <Button variant="outline" onClick={() => void status.refetch()}>
          ลองอีกครั้ง · Try again
        </Button>
      </StatusCard>
    );
  } else if (!status.data.enabled) {
    content = (
      <StatusCard
        icon={<MessageCircle className="size-5" />}
        title={
          <>
            <span>ยังไม่ได้ตั้งค่าการแจ้งเตือน LINE</span>
            <span className="text-sm font-normal text-neutral-500">
              LINE notifications are not set up yet
            </span>
          </>
        }
      >
        <Bilingual
          th="ระบบยังไม่ได้เปิดใช้งานการแจ้งเตือนผ่าน LINE กรุณาติดต่อเจ้าหน้าที่"
          en="Notifications through LINE are off for now. Contact CEDT staff."
        />
      </StatusCard>
    );
  } else if (status.data.linked) {
    const { linkedAt } = status.data;
    content = (
      <StatusCard
        icon={<CheckCircle2 className="size-5" />}
        title={
          <>
            <span>เชื่อมต่อ LINE แล้ว</span>
            <span className="text-sm font-normal text-neutral-500">LINE is linked</span>
          </>
        }
      >
        {linkedAt && (
          <Bilingual
            th={`เชื่อมต่อเมื่อ ${linkedDate(linkedAt, "th-TH")} น.`}
            en={`Linked on ${linkedDate(linkedAt, "en-GB")}`}
          />
        )}
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">ยกเลิกการเชื่อมต่อ · Unlink</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex flex-col gap-1 text-left">
                <span>ยกเลิกการเชื่อมต่อ LINE?</span>
                <span className="text-sm font-normal text-neutral-500">Unlink LINE?</span>
              </DialogTitle>
              <DialogDescription asChild>
                <div className="text-left">
                  <Bilingual
                    th="การแจ้งเตือนจะไม่ถูกส่งเข้า LINE ของคุณอีก จนกว่าจะเชื่อมต่อใหม่"
                    en="Notifications will stop arriving in your LINE chat until you link again."
                  />
                </div>
              </DialogDescription>
            </DialogHeader>
            {unlink.isError && (
              <p className="text-left text-sm text-status-danger-fg">
                ยกเลิกการเชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง · Couldn't unlink. Try again.
              </p>
            )}
            <DialogFooter className="flex-row justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline">ยกเลิก · Cancel</Button>
              </DialogClose>
              <Button onClick={() => unlink.mutate()} disabled={unlink.isPending}>
                {unlink.isPending && <Spinner className="size-4" />}
                ยืนยันการยกเลิก · Confirm unlink
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </StatusCard>
    );
  } else {
    const { addFriendUrl } = status.data;
    content = (
      <StatusCard
        icon={<MessageCircle className="size-5" />}
        title="เชื่อมต่อ LINE · Connect LINE"
      >
        <ol className="flex w-full flex-col gap-4 text-left">
          <li className="flex flex-col gap-3">
            <Bilingual
              th="1) เพิ่มบัญชี LINE ของ CEDT เป็นเพื่อน"
              en="1) Add the CEDT LINE account as a friend."
            />
            {addFriendUrl ? (
              <Button asChild className="self-start">
                <a href={addFriendUrl} target="_blank" rel="noopener noreferrer">
                  เพิ่มเพื่อน · Add friend
                </a>
              </Button>
            ) : (
              <p className="text-sm text-neutral-500">
                ขอบัญชี LINE จากเจ้าหน้าที่ · ask staff for the LINE account
              </p>
            )}
          </li>
          <li>
            <Bilingual
              th="2) บัญชีจะส่งลิงก์เชื่อมต่อมาในแชท เปิดลิงก์แล้วกด ยืนยัน"
              en="2) The account replies with a link. Open it and press Confirm."
            />
          </li>
          <li>
            <Bilingual
              th="3) เคยเพิ่มเพื่อนไว้แล้ว? ส่งข้อความใดก็ได้ไปยังบัญชีนั้นเพื่อรับลิงก์ใหม่"
              en="3) Already added it before? Send any message to that account to get a new link."
            />
          </li>
        </ol>
        <Button
          variant="outline"
          onClick={() => void status.refetch()}
          disabled={status.isFetching}
        >
          {status.isFetching && <Spinner className="size-4" />}
          ตรวจสอบอีกครั้ง · Check again
        </Button>
      </StatusCard>
    );
  }

  return (
    <main className="flex min-w-0 flex-col items-center px-4 py-8 sm:px-12 sm:py-16">{content}</main>
  );
}
