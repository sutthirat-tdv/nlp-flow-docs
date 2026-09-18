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

/**
 * Every AC_ENDPOINTS path with a real caller in tmf658, and the exact
 * TORO_* body fields that caller sends — read off AcPartnerRepository,
 * AcLineRepository, and the four point-redemption repositories
 * (kbank/bcp/pointx/pt-max), not guessed. Partner-specific variants are
 * noted rather than fully enumerated per partner.
 */
const AC_ENDPOINT_ROWS: {
  key: string;
  path: string;
  body: string;
  callers: string;
}[] = [
  {
    key: "VERIFY_SMALL_MERCHANT",
    path: "api/v1/partner/validate/transaction",
    body: "TORO_partnerName, TORO_requestDatetime, TORO_partnerRef1, TORO_partnerRef3, TORO_partnerPoint",
    callers: "AcPartnerRepository.verifySmallMerchant",
  },
  {
    key: "GET_PARTNER_MEMBER_POINT / PARTNER_GET_MEMBER_POINT (same path)",
    path: "api/v1/partner/getmember/point",
    body: "TORO_methodType, TORO_partnerName, TORO_requestDatetime, TORO_partnerCardNo, TORO_msisdn, TORO_citizenId?",
    callers: "AcPartnerRepository.getPartnerMember, *-point-redemption.repository.ts getMemberPoint",
  },
  {
    key: "PAYMENT_CONFIRM",
    path: "api/v1/partner/payment/confirm",
    body: "TORO_partnerName, TORO_merchantId, TORO_moneyAmount, TORO_aisPoint, TORO_msisdn, TORO_transactionId",
    callers: "AcPartnerRepository.paymentConfirm",
  },
  {
    key: "CHECK_PAYMENT_STATUS",
    path: "api/v1/partner/check/payment/status",
    body: "TORO_partnerName, TORO_merchantId, TORO_transactionId",
    callers: "AcPartnerRepository.checkPaymentStatus",
  },
  {
    key: "UNLINK_PARTNER_ACCOUNT",
    path: "api/v1/partner/unlink/account",
    body: "POINTX: TORO_partnerName, TORO_partnerCardNo, TORO_msisdn — KBANK adds TORO_requestDatetime — BCP: never calls AC, returns success locally",
    callers: "AcPartnerRepository.unlinkPartnerAccount",
  },
  {
    key: "REQUEST_PARTNER_OTP",
    path: "api/v1/partner/otp/request",
    body: "POINTX only: TORO_partnerName, TORO_partnerCardNo",
    callers: "AcPartnerRepository.requestPartnerOtp",
  },
  {
    key: "VERIFY_PARTNER_OTP",
    path: "api/v1/partner/otp/verify",
    body: "POINTX only: TORO_partnerName, TORO_partnerCardNo, TORO_otpCode, TORO_otpRefCode",
    callers: "AcPartnerRepository.verifyPartnerOtp",
  },
  {
    key: "PARTNER_GET_MEMBER_INFO",
    path: "api/v1/partner/getmember/info",
    body: "POINTX only: TORO_partnerName, TORO_partnerCardNo",
    callers: "AcPartnerRepository.getPartnerMemberInfo",
  },
  {
    key: "PARTNER_ADD_POINT",
    path: "api/v1/partner/add/point",
    body: "TORO_partnerName, TORO_transactionId, TORO_requestDatetime, TORO_partnerCardNo, TORO_partnerPoint, TORO_aisPoint, TORO_msisdn, TORO_partnerCardName?",
    callers: "AcPartnerRepository.addPoint",
  },
  {
    key: "PARTNER_PHONE_TO_ELIGIBILITY",
    path: "api/v1/partner/phone_to_eligibility",
    body: "TORO_partnerName, TORO_msisdn, TORO_packageId, TORO_transactionId",
    callers: "AcLineRepository.partnerPhoneToEligibility",
  },
  {
    key: "PARTNER_NOTIFY_PAYMENT_PASS",
    path: "api/v1/partner/notify_payment_pass",
    body: "TORO_partnerName, TORO_msisdn, TORO_packageId, TORO_transactionId",
    callers: "AcLineRepository.partnerNotifyPaymentPass",
  },
  {
    key: "PARTNER_REDEEM_POINT",
    path: "api/v1/partner/redeem/point",
    body: "KBank/BCP/PointX (identical shape): TORO_partnerName, TORO_requestDatetime, TORO_msisdn, TORO_partnerCardNo, TORO_partnerPoint, TORO_aisPoint, TORO_transactionId — PTMAX differs: TORO_partnerName, TORO_requestDatetime, TORO_partnerCardName, TORO_partnerCardNo, TORO_partnerMemberCardNo, TORO_partnerPoint",
    callers: "*-point-redemption.repository.ts redeemPoint (kbank/bcp/pointx/pt-max, one class each)",
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
                  <th>path</th>
                  <th>body fields</th>
                  <th>called from</th>
                </tr>
              </thead>
              <tbody>
                {AC_ENDPOINT_ROWS.map((row) => (
                  <tr key={row.key}>
                    <td className="mono">{row.key}</td>
                    <td className="mono dim">{row.path}</td>
                    <td className="mono dim" style={{ fontSize: 12 }}>
                      {row.body}
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
