/**
 * Hand written, like /guide and /integrations/myais — see REQUIREMENTS.md's
 * hand-written-content list. "How do I actually force this failure path" is
 * QA/domain knowledge, not something static analysis can state about itself.
 * Every claim here is grounded in reading the real source at the time it was
 * written (see the source links in each scenario) — if the code changes,
 * this page needs a manual update; it will not regenerate itself.
 */
import { Badge, PageHead, Section, SourceLink, TopicLink } from "../components/ui";
import { useData } from "../data";
import type { SourceRef } from "../types";

/** Placeholder values only — obviously fake, never real customer/transaction data. */
const PLACEHOLDER_DATETIME = "2026-01-01T00:00:00.000Z";
const PLACEHOLDER_MSISDN = "0812345678";
const PLACEHOLDER_CARD_NO = "1234567890";

interface AcEndpointVariant {
  /** Which partner this shape applies to — omitted when every partner sends the same shape. */
  label?: string;
  sample: Record<string, unknown>;
}

interface AcEndpointRow {
  key: string;
  path: string;
  variants: AcEndpointVariant[];
  callers: string;
  note?: string;
}

/**
 * Every AC_ENDPOINTS path with a real caller in tmf658, and a concrete
 * sample body for each — read off AcPartnerRepository, AcLineRepository, and
 * the four point-redemption repositories (kbank/bcp/pointx/pt-max), not
 * guessed. Two fields (TORO_moneyAmount, TORO_aisPoint on PAYMENT_CONFIRM)
 * are sent as strings, not numbers, because the calling code does
 * `.toString()` on them before building the body — sample reflects the
 * actual wire shape, not the input DTO's types.
 */
const AC_ENDPOINT_ROWS: AcEndpointRow[] = [
  {
    key: "VERIFY_SMALL_MERCHANT",
    path: "api/v1/partner/validate/transaction",
    callers: "AcPartnerRepository.verifySmallMerchant",
    variants: [
      {
        sample: {
          TORO_partnerName: "KPT",
          TORO_requestDatetime: PLACEHOLDER_DATETIME,
          TORO_partnerRef1: "REF-0001",
          TORO_partnerRef3: "REF-0003",
          TORO_partnerPoint: 100,
        },
      },
    ],
  },
  {
    key: "GET_PARTNER_MEMBER_POINT / PARTNER_GET_MEMBER_POINT (same path)",
    path: "api/v1/partner/getmember/point",
    callers: "AcPartnerRepository.getPartnerMember, *-point-redemption.repository.ts getMemberPoint",
    note: "TORO_citizenId is optional, omitted here.",
    variants: [
      {
        sample: {
          TORO_methodType: "3",
          TORO_partnerName: "KPT",
          TORO_requestDatetime: PLACEHOLDER_DATETIME,
          TORO_partnerCardNo: PLACEHOLDER_CARD_NO,
          TORO_msisdn: PLACEHOLDER_MSISDN,
        },
      },
    ],
  },
  {
    key: "PAYMENT_CONFIRM",
    path: "api/v1/partner/payment/confirm",
    callers: "AcPartnerRepository.paymentConfirm",
    variants: [
      {
        sample: {
          TORO_partnerName: "KPT",
          TORO_merchantId: "MERCHANT-0001",
          TORO_moneyAmount: "500",
          TORO_aisPoint: "500",
          TORO_msisdn: PLACEHOLDER_MSISDN,
          TORO_transactionId: "TXN-0001",
        },
      },
    ],
  },
  {
    key: "CHECK_PAYMENT_STATUS",
    path: "api/v1/partner/check/payment/status",
    callers: "AcPartnerRepository.checkPaymentStatus",
    variants: [
      {
        sample: {
          TORO_partnerName: "KPT",
          TORO_merchantId: "MERCHANT-0001",
          TORO_transactionId: "TXN-0001",
        },
      },
    ],
  },
  {
    key: "UNLINK_PARTNER_ACCOUNT",
    path: "api/v1/partner/unlink/account",
    callers: "AcPartnerRepository.unlinkPartnerAccount",
    note: "BCP never calls AC for this — it returns success locally without a request.",
    variants: [
      {
        label: "POINTX",
        sample: {
          TORO_partnerName: "PTX",
          TORO_partnerCardNo: PLACEHOLDER_CARD_NO,
          TORO_msisdn: PLACEHOLDER_MSISDN,
        },
      },
      {
        label: "KBANK",
        sample: {
          TORO_partnerName: "KPT",
          TORO_partnerCardNo: PLACEHOLDER_CARD_NO,
          TORO_msisdn: PLACEHOLDER_MSISDN,
          TORO_requestDatetime: PLACEHOLDER_DATETIME,
        },
      },
    ],
  },
  {
    key: "REQUEST_PARTNER_OTP",
    path: "api/v1/partner/otp/request",
    callers: "AcPartnerRepository.requestPartnerOtp",
    note: "Only PointX is implemented — every other partner throws before sending a request.",
    variants: [
      {
        label: "POINTX",
        sample: {
          TORO_partnerName: "PTX",
          TORO_partnerCardNo: PLACEHOLDER_CARD_NO,
        },
      },
    ],
  },
  {
    key: "VERIFY_PARTNER_OTP",
    path: "api/v1/partner/otp/verify",
    callers: "AcPartnerRepository.verifyPartnerOtp",
    note: "Only PointX is implemented.",
    variants: [
      {
        label: "POINTX",
        sample: {
          TORO_partnerName: "PTX",
          TORO_partnerCardNo: PLACEHOLDER_CARD_NO,
          TORO_otpCode: "123456",
          TORO_otpRefCode: "OTPREF-0001",
        },
      },
    ],
  },
  {
    key: "PARTNER_GET_MEMBER_INFO",
    path: "api/v1/partner/getmember/info",
    callers: "AcPartnerRepository.getPartnerMemberInfo",
    note: "Only PointX is implemented.",
    variants: [
      {
        label: "POINTX",
        sample: {
          TORO_partnerName: "PTX",
          TORO_partnerCardNo: PLACEHOLDER_CARD_NO,
        },
      },
    ],
  },
  {
    key: "PARTNER_ADD_POINT",
    path: "api/v1/partner/add/point",
    callers: "AcPartnerRepository.addPoint",
    note: "TORO_partnerCardName is optional.",
    variants: [
      {
        sample: {
          TORO_partnerName: "KPT",
          TORO_transactionId: "TXN-0001",
          TORO_requestDatetime: PLACEHOLDER_DATETIME,
          TORO_partnerCardNo: PLACEHOLDER_CARD_NO,
          TORO_partnerPoint: 100,
          TORO_aisPoint: 100,
          TORO_msisdn: PLACEHOLDER_MSISDN,
          TORO_partnerCardName: "TEST USER",
        },
      },
    ],
  },
  {
    key: "PARTNER_PHONE_TO_ELIGIBILITY",
    path: "api/v1/partner/phone_to_eligibility",
    callers: "AcLineRepository.partnerPhoneToEligibility",
    variants: [
      {
        sample: {
          TORO_partnerName: "KPT",
          TORO_msisdn: PLACEHOLDER_MSISDN,
          TORO_packageId: "PKG-0001",
          TORO_transactionId: "TXN-0001",
        },
      },
    ],
  },
  {
    key: "PARTNER_NOTIFY_PAYMENT_PASS",
    path: "api/v1/partner/notify_payment_pass",
    callers: "AcLineRepository.partnerNotifyPaymentPass",
    variants: [
      {
        sample: {
          TORO_partnerName: "KPT",
          TORO_msisdn: PLACEHOLDER_MSISDN,
          TORO_packageId: "PKG-0001",
          TORO_transactionId: "TXN-0001",
        },
      },
    ],
  },
  {
    key: "PARTNER_REDEEM_POINT",
    path: "api/v1/partner/redeem/point",
    callers: "*-point-redemption.repository.ts redeemPoint (kbank/bcp/pointx/pt-max, one class each)",
    variants: [
      {
        label: "KBANK / BCP / POINTX (identical shape)",
        sample: {
          TORO_partnerName: "KPT",
          TORO_requestDatetime: PLACEHOLDER_DATETIME,
          TORO_msisdn: PLACEHOLDER_MSISDN,
          TORO_partnerCardNo: PLACEHOLDER_CARD_NO,
          TORO_partnerPoint: 100,
          TORO_aisPoint: 100,
          TORO_transactionId: "TXN-0001",
        },
      },
      {
        label: "PTMAX",
        sample: {
          TORO_partnerName: "PTM",
          TORO_requestDatetime: PLACEHOLDER_DATETIME,
          TORO_partnerCardName: "TEST USER",
          TORO_partnerCardNo: PLACEHOLDER_CARD_NO,
          TORO_partnerMemberCardNo: PLACEHOLDER_CARD_NO,
          TORO_partnerPoint: 100,
        },
      },
    ],
  },
];

function useSourceRef() {
  const { indexes } = useData();
  return (repoId: string, file: string, line: number): SourceRef | null => {
    const repo = indexes.repoById.get(repoId);
    if (!repo) return null;
    return {
      repoId,
      file,
      line,
      url: `${repo.github}/blob/${repo.commit.sha}/${file}#L${line}`,
    };
  };
}

export function TestingNotesPage() {
  const source = useSourceRef();

  const srcEntryPoint = source(
    "tmf658",
    "src/loyaltyManagement/consumers/_developer-event.consumer.controller.ts",
    21,
  );
  const srcExecute = source(
    "tmf658",
    "src/loyaltyManagement/useCases/_test-ac.use-case.ts",
    20,
  );
  const srcUrlGuard = source(
    "tmf658",
    "src/loyaltyManagement/useCases/_test-ac.use-case.ts",
    25,
  );
  const srcRepublish = source(
    "tmf658",
    "src/loyaltyManagement/useCases/_test-ac.use-case.ts",
    34,
  );
  const srcRepoTest = source(
    "tmf658",
    "src/infrastructure/ac/repositories/_developer.ac.repository.ts",
    8,
  );
  const srcCreateUrl = source(
    "tmf658",
    "src/infrastructure/ac/classes/ac-factory.repository.ts",
    68,
  );
  const srcDto = source(
    "tmf658",
    "src/loyaltyManagement/dtos/consumers/_developer.consumer.dto.ts",
    4,
  );
  const srcZoneGuard = source(
    "tmf658",
    "src/loyaltyManagement/consumers/_developer-event.consumer.controller.ts",
    24,
  );
  const srcAcConfig = source("tmf658", "src/configs/ac.config.ts", 27);

  return (
    <>
      <PageHead title="Backdoor testing notes">
        <code>_developer</code>-only hooks and debug backdoors that are real
        code on <code>origin/sit</code> but deliberately excluded from every
        generated catalog on this site (REQUIREMENTS.md's extractor rules) —
        documented here instead, since "how do I actually trigger this" is
        domain knowledge no static analysis can state about itself. Add a
        section here when the next one comes up.
      </PageHead>

      <Section
        title={
          <>
            AC connectivity test via{" "}
            <span className="mono">nlp.pty.addCorrelationIdFailed</span>{" "}
            (DEV/SIT only)
          </>
        }
        subtitle="tmf658 — a _developer backdoor, deliberately excluded from every generated catalog on this site"
      >
        <div className="card">
          <div className="callout" style={{ marginBottom: 16 }}>
            <strong>Why this isn't on /topics or /use-cases.</strong> This
            consumer lives in a <code>_developer</code>-prefixed file, and
            REQUIREMENTS.md's extractor rules deliberately drop{" "}
            <code>_developer</code> surfaces from every catalog (seed/debug
            code isn't a product API). That's correct behaviour, not a gap —
            the code below is real and currently on <code>origin/sit</code>,
            it's just intentionally invisible to the generated site. Both
            source files are marked <code>// TODO: remove this file</code>,
            so treat this as temporary and re-verify it still exists before
            relying on it.
          </div>

          <p>
            In production,{" "}
            <span className="mono">nlp.pty.addCorrelationIdFailed</span> is
            the failure signal from <code>AddCorrelationIdUseCase</code> (the
            consumer of <TopicLink topic="nlp.pty.addCorrelationId" />). But
            tmf658 also binds a second,{" "}
            <code>_developer</code>-only consumer to that exact same failure
            topic —{" "}
            {srcEntryPoint ? (
              <SourceLink
                source={srcEntryPoint}
                label="DevelopEventConsumerController.testAc"
              />
            ) : (
              "DevelopEventConsumerController.testAc"
            )}{" "}
            — that repurposes it as a manual "make an outbound HTTP call"
            test hook, gated to{" "}
            {srcZoneGuard ? (
              <SourceLink
                source={srcZoneGuard}
                label="ZONE === dev or ZONE === sit"
              />
            ) : (
              "ZONE === dev or ZONE === sit"
            )}
            .
          </p>

          <h3 style={{ marginTop: 18 }}>How it works</h3>
          <p>
            Publish a message onto{" "}
            <span className="mono">nlp.pty.addCorrelationIdFailed</span>{" "}
            shaped like{" "}
            {srcDto ? (
              <SourceLink source={srcDto} label="TestAcDto" />
            ) : (
              "TestAcDto"
            )}{" "}
            — both fields required:
          </p>
          <pre className="mono" style={{ overflowX: "auto" }}>
{`{
  "url": "https://<ac-base-url>/<ac-endpoint-path>",
  "body": { }
}`}
          </pre>
          <p>
            {srcExecute ? (
              <SourceLink source={srcExecute} label="TestAcUseCase.execute()" />
            ) : (
              "TestAcUseCase.execute()"
            )}{" "}
            checks{" "}
            {srcUrlGuard ? (
              <SourceLink source={srcUrlGuard} label="if (!data.url) return" />
            ) : (
              "if (!data.url) return"
            )}{" "}
            — a payload with no <code>url</code> is a silent no-op, nothing
            happens, no error. When <code>url</code> is present it calls{" "}
            {srcRepoTest ? (
              <SourceLink
                source={srcRepoTest}
                label="DeveloperAcRepository.test(data)"
              />
            ) : (
              "DeveloperAcRepository.test(data)"
            )}
            , which POSTs <code>body</code> to <code>url</code> via the shared
            AC axios client, auto-attaching <code>x-request-id</code>,{" "}
            <code>nlp-transaction</code>, and <code>nlp-session</code>{" "}
            headers. It then publishes the raw response back onto the{" "}
            <em>same</em> topic —{" "}
            {srcRepublish ? (
              <SourceLink
                source={srcRepublish}
                label="nlp.pty.addCorrelationIdFailed again"
              />
            ) : (
              "nlp.pty.addCorrelationIdFailed again"
            )}{" "}
            on success, or an error event on the same topic if the call
            throws.
          </p>

          <div className="callout" style={{ marginTop: 16 }}>
            <strong>
              <code>url</code> is used exactly as given, not appended to AC's
              configured base URL.
            </strong>{" "}
            {srcCreateUrl ? (
              <SourceLink
                source={srcCreateUrl}
                label="AcRepositoryFactory.createUrl()"
              />
            ) : (
              "AcRepositoryFactory.createUrl()"
            )}{" "}
            passes a plain string straight through — this hook can POST to
            any reachable URL, not only AC's. It's scoped for testing AC in
            name and intent (point <code>url</code> at an AC partner endpoint
            — see <Badge>AC</Badge> on{" "}
            <span className="mono">/infrastructure/ac</span> for the real
            base URL / path config), but nothing in the code enforces that.
          </div>

          <h3 style={{ marginTop: 18 }}>What to check after firing it</h3>
          <ul style={{ paddingLeft: 20 }}>
            <li>
              Confirm the environment is actually DEV or SIT first — this is
              a silent no-op in every other zone, including a misconfigured
              one, so a lack of response tells you nothing on its own.
            </li>
            <li>
              Watch{" "}
              <span className="mono">nlp.pty.addCorrelationIdFailed</span>{" "}
              directly (a Kafka consumer/CLI) for the republished response or
              error — there's no other visible side effect, and nothing else
              in these five repos consumes this topic.
            </li>
            <li>
              tmf658's logs carry a <code>[TestAcUseCase]</code>-prefixed debug
              line for the outgoing call and its response, and an exception
              line on failure.
            </li>
          </ul>
        </div>
      </Section>

      <Section
        title="AC endpoints — real url/body pairs to try"
        subtitle="every AC_ENDPOINTS path actually called, and the exact TORO_* body fields sent — read straight off AcPartnerRepository, AcLineRepository, and the four point-redemption repositories, not guessed"
      >
        <div className="card">
          <p className="dim">
            <code>url</code> is <code>{"{AC_BASE_URL}/{path below}"}</code> —{" "}
            <code>AC_BASE_URL</code> is an env var (see{" "}
            {srcAcConfig ? (
              <SourceLink source={srcAcConfig} label="ac.config.ts" />
            ) : (
              "ac.config.ts"
            )}
            ), not something this page can give you a real value for.{" "}
            <code>TORO_partnerName</code> must be one of{" "}
            <code>acConfig.PARTNER_CODES</code> — also env-configured, default
            values <code>KPT</code> (KBank) / <code>BCP</code> (Bangchak) /{" "}
            <code>PTX</code> (PointX) / <code>PTM</code> (PTMAX) /{" "}
            <code>KSC</code>.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>AC_ENDPOINTS key</th>
                  <th className="nowrap">path</th>
                  <th>sample body</th>
                  <th>called from</th>
                </tr>
              </thead>
              <tbody>
                {AC_ENDPOINT_ROWS.map((row) => (
                  <tr key={row.key}>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {row.key}
                    </td>
                    <td className="mono dim nowrap">{row.path}</td>
                    <td style={{ minWidth: 320 }}>
                      {row.variants.map((variant, i) => (
                        <div key={variant.label ?? i} style={{ marginBottom: 8 }}>
                          {variant.label ? (
                            <div
                              className="dimmer"
                              style={{ fontSize: 11, marginBottom: 2 }}
                            >
                              {variant.label}
                            </div>
                          ) : null}
                          <pre
                            className="mono"
                            style={{ fontSize: 11.5, margin: 0, overflowX: "auto" }}
                          >
                            {JSON.stringify(variant.sample, null, 2)}
                          </pre>
                        </div>
                      ))}
                      {row.note ? (
                        <p
                          className="dimmer"
                          style={{ fontSize: 11, margin: "6px 0 0" }}
                        >
                          {row.note}
                        </p>
                      ) : null}
                    </td>
                    <td className="dim" style={{ fontSize: 12 }}>
                      {row.callers}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="dim" style={{ marginTop: 10 }}>
            <code>AUTHENTICATE</code> (
            <span className="mono">api/v1/partner/authenticate</span>) is
            declared in <code>AC_ENDPOINTS</code> but not called from
            anywhere in tmf658 — dead config, not a usable path.
          </p>
        </div>
      </Section>
    </>
  );
}
