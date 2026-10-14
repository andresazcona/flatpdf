"""Generate flatpdf.drawio (AWS architecture, job flow, local dev). Python 3 stdlib only.

python docs/diagrams/gen_drawio.py
"""

from pathlib import Path
from xml.sax.saxutils import quoteattr

OUT = Path(__file__).with_name("flatpdf.drawio")

COMPUTE, STORAGE, NETWORK = "#ED7100", "#7AA116", "#8C4FFF"
SECURITY, MANAGEMENT = "#DD344C", "#E7157B"
BLUE, RED, GREY, GREEN, DARK = "#1A73E8", "#C62828", "#888888", "#2E7D32", "#232F3E"

ICON = (
    "sketch=0;outlineConnect=0;fontColor=#232F3E;gradientColor=none;fillColor={color};"
    "strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;"
    "html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;"
    "resIcon=mxgraph.aws4.{res};"
)
GROUP = (
    "points=[];outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;"
    "fontStyle=1;container=0;pointerEvents=0;collapsible=0;recursiveResize=0;"
    "shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.{icon};strokeColor={color};fillColor={fill};"
    "verticalAlign=top;align=left;spacingLeft=30;fontColor={color};dashed={dashed};"
)
BOX = (
    "rounded=1;whiteSpace=wrap;html=1;arcSize={arc};fillColor={fill};strokeColor={stroke};"
    "fontSize=12;align={align};verticalAlign={valign};spacing=10;{extra}"
)
EDGE = (
    "edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=block;endFill=1;strokeWidth={width};"
    "strokeColor={color};fontColor={color};fontSize=11;labelBackgroundColor=#ffffff;"
    "dashed={dashed};{extra}"
)


def label(name: str, detail: str = "", cost: str = "") -> str:
    parts = [f"<b>{name}</b>"]
    if detail:
        parts.append(f'<span style="font-size:11px;color:#666;">{detail}</span>')
    if cost:
        parts.append(f'<span style="font-size:11px;color:{GREEN};">{cost}</span>')
    return "<br>".join(parts)


def step(n) -> str:
    """Numbered marker used in flow labels."""
    return (
        f'<span style="background-color:{DARK};color:#ffffff;padding:1px 6px;">'
        f"<b>{n}</b></span>&nbsp;"
    )


class Page:
    def __init__(self, name: str, title: str, subtitle: str):
        self.name, self.cells, self.n = name, [], 0
        self.text(
            40,
            20,
            1400,
            50,
            f'<b style="font-size:20px;">{title}</b><br>'
            f'<span style="font-size:12px;color:#666;">{subtitle}</span>',
        )

    def _id(self) -> str:
        self.n += 1
        return f"{self.name}-{self.n}"

    def vertex(self, value: str, style: str, x, y, w, h) -> str:
        cid = self._id()
        self.cells.append(
            f'<mxCell id="{cid}" value={quoteattr(value)} style={quoteattr(style)} vertex="1" '
            f'parent="1"><mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/>'
            "</mxCell>"
        )
        return cid

    def text(self, x, y, w, h, value: str, align: str = "left") -> str:
        style = f"text;html=1;align={align};verticalAlign=top;whiteSpace=wrap;fontSize=12;"
        return self.vertex(value, style, x, y, w, h)

    def icon(self, x, y, res, color, value, size=78) -> str:
        return self.vertex(value, ICON.format(color=color, res=res), x, y, size, size)

    def group(self, x, y, w, h, value, icon, color, fill="none", dashed=0) -> str:
        return self.vertex(
            value, GROUP.format(icon=icon, color=color, fill=fill, dashed=dashed), x, y, w, h
        )

    def box(
        self, x, y, w, h, value, fill="#ffffff", stroke="#666666", align="center",
        valign="middle", arc=8, dashed=False,
    ) -> str:
        extra = "dashed=1;dashPattern=6 4;" if dashed else ""
        style = BOX.format(
            fill=fill, stroke=stroke, align=align, valign=valign, arc=arc, extra=extra
        )
        return self.vertex(value, style, x, y, w, h)

    def zone(self, x, y, w, h, title, color, fill="#ffffff") -> str:
        """Dashed container with a bold title; edges can attach to its border."""
        zid = self.box(x, y, w, h, "", fill=fill, stroke=color, arc=3, dashed=True)
        self.text(x + 10, y + 6, w - 20, 24, f'<b style="color:{color};">{title}</b>')
        return zid

    def card(self, x, y, w, h, res, color, title, detail, fill="#ffffff", cost="") -> str:
        """Bordered box with a service icon on the left and its text on the right."""
        cid = self.box(x, y, w, h, "", fill=fill, stroke=color, arc=3)
        self.icon(x + 14, y + 14, res, color, "", size=52)
        self.text(x + 76, y + 10, w - 86, h - 14, label(title, detail, cost))
        return cid

    def edge(
        self, src, tgt, value="", color=BLUE, dashed=0, width=2, exit=None, entry=None,
        points=(), offset=None,
    ) -> None:
        extra = ""
        if exit:
            extra += f"exitX={exit[0]};exitY={exit[1]};exitDx=0;exitDy=0;"
        if entry:
            extra += f"entryX={entry[0]};entryY={entry[1]};entryDx=0;entryDy=0;"
        style = EDGE.format(color=color, dashed=dashed, width=width, extra=extra)
        pts = "".join(f'<mxPoint x="{px}" y="{py}"/>' for px, py in points)
        geo = '<mxGeometry relative="1" as="geometry">'
        if pts:
            geo += f'<Array as="points">{pts}</Array>'
        if offset:
            geo += f'<mxPoint x="{offset[0]}" y="{offset[1]}" as="offset"/>'
        geo += "</mxGeometry>"
        self.cells.append(
            f'<mxCell id="{self._id()}" value={quoteattr(value)} style={quoteattr(style)} '
            f'edge="1" parent="1" source="{src}" target="{tgt}">{geo}</mxCell>'
        )

    def xml(self) -> str:
        return (
            f'<diagram id="{self.name}" name="{self.name}"><mxGraphModel dx="1900" dy="1200" '
            'grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" '
            'page="1" pageScale="1" pageWidth="1900" pageHeight="1200" math="0" shadow="0">'
            '<root><mxCell id="0"/><mxCell id="1" parent="0"/>'
            + "".join(self.cells)
            + "</root></mxGraphModel></diagram>"
        )


def frac(v, start, size):
    return round((v - start) / size, 3)


# --------------------------------------------------------------------------------------------
# Page 1: AWS architecture
# --------------------------------------------------------------------------------------------
def aws_architecture() -> Page:
    p = Page(
        "AWS architecture",
        "flatpdf on AWS",
        "ALB · ECS Fargate · S3 · SQS + DLQ · Lambda (container image) · CloudWatch · "
        "GitHub OIDC · Terraform (not deployed)",
    )
    client = p.box(
        40, 350, 170, 80, "<b>API client</b><br>"
        '<span style="font-size:11px;color:#666;">multipart PDF + x-api-key</span>',
        fill="#f5f5f5",
    )
    p.group(260, 90, 1620, 890, "AWS Region us-east-1", "group_region", "#00A4A6", dashed=1)
    p.group(290, 250, 640, 300, "VPC 10.20.0.0/16", "group_vpc", NETWORK, fill="#E6F2F8")
    p.group(310, 290, 600, 240, "Public subnets (2 AZs), no NAT", "group_subnet", STORAGE,
            fill="#E8F8E8")

    alb = p.icon(340, 340, "elastic_load_balancing", NETWORK,
                 label("Application Load Balancer", "HTTPS :443 · 2 AZs", "~ $17 / mo"))
    cx, cy, cw, ch = 560, 320, 330, 170
    api = p.card(cx, cy, cw, ch, "fargate", COMPUTE, "API container",
                 "ECS Fargate · 0.5 vCPU / 1 GB<br>Node 22 · non-root<br>"
                 "auth · validate · enqueue · presign",
                 fill="#FFF7ED", cost="~ $18 / mo + $3.65 public IP")
    ssm = p.icon(1000, 105, "systems_manager", MANAGEMENT,
                 label("SSM Parameter Store", "API key SHA-256 digests", "~ $0"))

    s3 = p.zone(560, 600, 580, 200, "Amazon S3 · SSE-S3 · public access blocked · TLS only",
                STORAGE, fill="#F6FBEA")
    p.icon(620, 650, "s3", STORAGE, label("uploads", "deleted after processing · 1 d", "~ $0"))
    p.icon(900, 650, "s3", STORAGE, label("results", "lifecycle expiry (TTL)", "~ $0"))

    sq = p.zone(1010, 270, 290, 210, "Amazon SQS · SSE", MANAGEMENT, fill="#FDF2F7")
    jobs_icon = p.icon(1030, 320, "sqs", MANAGEMENT, label("jobs queue", "visibility 720 s", "~ $0"))
    dlq_icon = p.icon(1190, 320, "sqs", MANAGEMENT, label("DLQ", "14 d retention", "alarm on depth"))
    lam = p.card(1450, 270, 340, 210, "lambda", COMPUTE, "Worker",
                 "Lambda container image (ECR) · 2 GB<br>reserved concurrency 5, timeout 120 s<br>"
                 "rasterize (pdfjs + canvas) · watermark ·<br>rebuild (pdf-lib) · store",
                 fill="#FFF7ED", cost="~ $0.10 per 1,000 docs")
    alarm = p.card(1420, 100, 270, 100, "cloudwatch_2", MANAGEMENT, "CloudWatch alarms",
                   "DLQ depth · worker errors · queue age · ALB 5xx", fill="#FDF2F7")
    p.icon(1760, 108, "sns", MANAGEMENT, label("SNS topic", "email on alarm", "~ $0"))
    ecr = p.icon(1740, 590, "ecr", COMPUTE,
                 label("Amazon ECR", "api + worker images", "~ $0.10 / mo"))

    gh = p.box(40, 815, 180, 80, "<b style=\"color:#ffffff;\">GitHub Actions</b><br>"
               '<span style="font-size:11px;color:#ddd;">test · build · terraform</span>',
               fill=DARK, stroke=DARK)
    role = p.icon(330, 815, "identity_and_access_management", SECURITY,
                  label("Deploy role", "OIDC · main only · prefix-scoped", "~ $0"))

    # user traffic
    p.edge(client, alb, "HTTPS", exit=(1, 0.5), entry=(0, 0.5))
    p.edge(alb, api, "", exit=(1, 0.5), entry=(0, frac(379, cy, ch)))
    p.edge(api, s3, "PutObject upload + job record · GetObject for presign",
           exit=(0.5, 1), entry=(frac(725, 560, 580), 0))
    p.edge(s3, client, "presigned download URL (direct from S3)", color=GREEN,
           exit=(0, 0.5), entry=(0.5, 1), points=((125, 700),))
    p.edge(api, sq, "SendMessage {jobId}", exit=(1, 0.5), entry=(0, frac(405, 270, 210)))
    p.edge(sq, lam, "event source mapping<br>batch 1 · partial failures", exit=(1, 0.5),
           entry=(0, frac(375, 270, 210)))
    p.edge(lam, s3, "Get/Delete upload · PutObject results", exit=(0.5, 1), entry=(1, 0.5),
           points=((1620, 700),))
    # config / ops
    p.edge(ssm, api, "GetParameters at start", color=GREY, dashed=1, width=1, exit=(0, 0.5),
           entry=(frac(760, cx, cw), 0), points=((760, 144),))
    p.edge(dlq_icon, alarm, "", color=GREY, dashed=1, width=1, exit=(0.5, 0), entry=(0, 0.5),
           points=((1229, 150),))
    p.edge(lam, alarm, "errors", color=GREY, dashed=1, width=1, exit=(frac(1489, 1450, 340), 0),
           entry=(frac(1489, 1420, 270), 1))
    p.edge(jobs_icon, dlq_icon, "3 receives", color=GREY, dashed=1, width=1, exit=(1, 0.5), entry=(0, 0.5))
    p.edge(ecr, lam, "image pull", color=GREY, dashed=1, width=1, exit=(0.5, 0),
           entry=(frac(1779, 1450, 340), 1))
    # CI/CD
    p.edge(gh, role, "OIDC", color=GREY, dashed=1, exit=(1, 0.5), entry=(0, 0.5))
    p.edge(role, ecr, "docker push · terraform apply", color=GREY, dashed=1, exit=(1, 0.5),
           entry=(0, 0.5), points=((1700, 854), (1700, 629)))

    p.box(
        40, 1010, 900, 160,
        "<b>Security and IAM</b><br>"
        "• ALB security group: 443 from allowed CIDRs only; task group: 3000 from the ALB only, egress 443<br>"
        "• API task role: PutObject uploads, Get/PutObject results, SendMessage. No deletes, never reads uploads<br>"
        "• Worker role: Get/Delete uploads, Get/Put results, consume the queue, write its own log group<br>"
        "• Buckets: SSE-S3, public access blocked, TLS-only policy, lifecycle expiry<br>"
        "• API keys: SHA-256 digests in SSM SecureString, compared in constant time; none in the image<br>"
        "• Deploy: GitHub OIDC role limited to this repo and main; no static keys anywhere",
        fill="#f5f5f5", stroke="#999999", align="left", valign="top",
    )
    p.box(
        960, 1010, 900, 160,
        "<b>Estimated cost, us-east-1, not deployed</b><br>"
        "<b>Fixed ≈ $47 / month</b>: ALB $17 · 2 ALB public IPv4 $7.30 · Fargate 0.5 vCPU / 1 GB $18 · "
        "task public IPv4 $3.65 · logs, ECR, SSM ≈ $1<br>"
        "<b>Variable ≈ $0.22 per 1,000 documents</b>: Lambda $0.10 · data transfer out $0.09 · "
        "S3 + SQS requests $0.03<br>"
        '<span style="font-size:11px;">Assumes 10-page documents, 1 recipient, 3 s render at 2 GB, '
        "1 MB result, no free-tier credit.</span>",
        fill="#D5E8D4", stroke="#82B366", align="left", valign="top",
    )
    return p


# --------------------------------------------------------------------------------------------
# Page 2: numbered job flow
# --------------------------------------------------------------------------------------------
def job_flow() -> Page:
    p = Page(
        "Job flow",
        "flatpdf job flow",
        "upload → queue → rasterize → watermark → rebuild → store → presigned download → expiry",
    )
    client = p.box(30, 340, 150, 80, "<b>API client</b><br>"
                   '<span style="font-size:11px;color:#666;">recipient(s) + PDF</span>',
                   fill="#f5f5f5")
    ax, ay, aw, ah = 340, 290, 270, 190
    api = p.card(ax, ay, aw, ah, "fargate", COMPUTE, "API (ECS Fargate)",
                 "x-api-key checked against SHA-256 digests<br>content-type + %PDF- magic bytes<br>"
                 "page count ≤ MAX_PAGES, size ≤ MAX_UPLOAD_MB<br>job record written, 202 returned",
                 fill="#FFF7ED")
    sqs = p.card(720, 320, 170, 130, "sqs", MANAGEMENT, "SQS jobs", "DLQ after 3 receives",
                 fill="#FDF2F7")

    lx, ly, lw, lh = 990, 110, 610, 600
    lz = p.zone(lx, ly, lw, lh, "Worker: Lambda container image, 2 GB, concurrency capped",
                COMPUTE, fill="#FFF7ED")
    steps = [
        (3, "Rasterize", "pdfjs-dist renders every page onto an @napi-rs/canvas at DPI 150 "
            "(page size capped at 40 megapixels). Same code on Linux, Lambda and Windows."),
        (4, "Watermark", "Per recipient: tiled diagonal text, semi-transparent, burned into the "
            "pixels, plus a footer with recipient, UTC time and document hash prefix."),
        (5, "Rebuild", "pdf-lib assembles an image-only PDF from the JPEG pages. Nothing from the "
            "source is copied: no text layer, no metadata. One PDF per recipient."),
        (6, "Store", "PutObject results/&lt;jobId&gt;/n.pdf, job record set to done, upload "
            "deleted. Safe to run twice: a done job is skipped on redelivery."),
    ]
    prev = None
    for i, (n, title, body) in enumerate(steps):
        sid = p.box(lx + 30, ly + 60 + i * 130, lw - 60, 105,
                    f"{step(n)}<b>{title}</b><br>"
                    f'<span style="font-size:11px;color:#444;">{body}</span>',
                    fill="#ffffff", stroke=COMPUTE, align="left", arc=4)
        if prev:
            p.edge(prev, sid, "", color=COMPUTE, width=2, exit=(0.5, 1), entry=(0.5, 0))
        prev = sid
    p.icon(lx + lw - 90, ly + 8, "lambda", COMPUTE, "", size=44)

    s3 = p.zone(990, 780, 610, 180, "Amazon S3", STORAGE, fill="#F6FBEA")
    up = p.icon(1230, 810, "s3", STORAGE, label("uploads", "expires in 1 day"))
    res = p.icon(1430, 810, "s3", STORAGE, label("results", "lifecycle expiry"))
    exp = p.card(1690, 780, 190, 180, "s3", STORAGE, "Expiry",
                 "S3 lifecycle deletes results<br>job <i>expiresAt</i>: GET returns 410<br>"
                 "download URL TTL 15 min", fill="#F6FBEA")
    p.box(
        540, 540, 400, 150,
        "<b>Failure handling</b><br>"
        "• Corrupt, encrypted or too many pages: job becomes <i>failed</i> with a message, "
        "the SQS message is deleted<br>"
        "• Transient error: job goes back to <i>queued</i> and the message is retried<br>"
        "• After 3 receives the message lands in the DLQ and the alarm fires<br>"
        "• Reserved concurrency caps parallel renders; a backlog waits in SQS",
        fill="#f5f5f5", stroke="#999999", align="left", valign="top",
    )

    p.edge(client, api, step(1) + "POST /v1/jobs", exit=(1, 0.3), entry=(0, 0.3))
    p.edge(api, client, step(2) + "202 {jobId}", color=GREY, exit=(0, 0.75), entry=(1, 0.75))
    p.edge(api, sqs, step(2) + "SendMessage", exit=(1, 0.5), entry=(0, frac(385, 320, 130)))
    p.edge(api, up, step(2) + "PutObject PDF + job record", exit=(0.5, 1), entry=(0, 0.5),
           points=((475, 849),))
    p.edge(sqs, lz, "event source<br>mapping", exit=(1, 0.5), entry=(0, frac(385, ly, lh)))
    p.edge(up, lz, step(3) + "GetObject upload", color=STORAGE, exit=(0.5, 0),
           entry=(frac(1269, lx, lw), 1))
    p.edge(lz, res, step(6) + "PutObject results", color=STORAGE, exit=(frac(1469, lx, lw), 1),
           entry=(0.5, 0))
    p.edge(client, api, step(7) + "GET /v1/jobs/:id → status + presigned URL(s)", color=GREEN,
           exit=(0.5, 0), entry=(0.5, 0), points=((105, 250), (475, 250)))
    p.edge(s3, client, step(7) + "download straight from S3 via the presigned URL", color=GREEN,
           exit=(0.5, 1), entry=(0.5, 1), points=((1295, 1030), (105, 1030)))
    p.edge(s3, exp, step(8) + "expire", color=GREY, dashed=1, exit=(1, 0.5), entry=(0, 0.5))
    return p


# --------------------------------------------------------------------------------------------
# Page 3: local dev architecture
# --------------------------------------------------------------------------------------------
def local_dev() -> Page:
    p = Page(
        "Local dev",
        "flatpdf local development",
        "node src/server.js · local disk + in-process queue · no AWS account, no Docker",
    )
    curl = p.box(40, 280, 200, 90, "<b>curl / browser / tests</b><br>"
                 '<span style="font-size:11px;color:#666;">HTTP :3000 + x-api-key</span>',
                 fill="#f5f5f5")
    p.zone(300, 100, 1110, 720, "one Node.js process: node src/server.js", DARK, fill="#ffffff")

    app = p.box(340, 190, 270, 200,
                "<b>src/http/app.js</b><br>"
                '<span style="font-size:11px;color:#444;">Express routes<br>'
                "POST /v1/jobs · GET /v1/jobs/:id<br>GET /healthz · GET /v1/files/*<br>"
                "API-key auth (SHA-256, constant time)<br>multer limits, content-type, magic bytes, "
                "page count</span>", fill="#EAF1FB", stroke=BLUE, align="left", arc=4)
    jobs = p.box(690, 190, 270, 200,
                 "<b>src/jobs.js</b><br>"
                 '<span style="font-size:11px;color:#444;">submit: store upload, write job JSON, '
                 "send message<br>process: idempotent worker<br>view: job + fresh signed URLs"
                 "</span>", fill="#EAF1FB", stroke=BLUE, align="left", arc=4)
    queue = p.box(1070, 190, 320, 200,
                  "<b>in-process queue</b> (storage/local.js)<br>"
                  '<span style="font-size:11px;color:#444;">promise chain, one consumer<br>'
                  "no retries (MAX_ATTEMPTS=1), lost on restart<br>AWS: SQS + DLQ replaces it"
                  "</span>", fill="#FDF2F7", stroke=MANAGEMENT, align="left", arc=4)
    store = p.box(340, 520, 270, 200,
                  "<b>storage/local.js</b><br>"
                  '<span style="font-size:11px;color:#444;">put / get / delete under DATA_DIR<br>'
                  "HMAC-signed expiring download URLs<br>(secret lives only in memory)<br>"
                  "sweep() every 60 s removes files older than RESULT_TTL_SEC<br>"
                  "AWS: S3 presign + lifecycle rule replaces it</span>",
                  fill="#F6FBEA", stroke=STORAGE, align="left", arc=4)
    pipe = p.zone(800, 470, 590, 310, "src/pdf/flatten.js: one render per page, N stamped copies",
                  COMPUTE, fill="#FFF7ED")
    r = p.box(820, 530, 170, 150, "<b>rasterize.js</b><br>"
              '<span style="font-size:11px;color:#444;">pdfjs-dist renders pages onto '
              "@napi-rs/canvas<br>DPI configurable</span>", stroke=COMPUTE, arc=4)
    w = p.box(1010, 530, 170, 150, "<b>watermark.js</b><br>"
              '<span style="font-size:11px;color:#444;">diagonal recipient text + footer '
              "(recipient, UTC time, hash prefix)</span>", stroke=COMPUTE, arc=4)
    b = p.box(1200, 530, 170, 150, "<b>rebuild.js</b><br>"
              '<span style="font-size:11px;color:#444;">pdf-lib: JPEG pages, image-only PDF, '
              "metadata stripped</span>", stroke=COMPUTE, arc=4)
    disk = p.vertex(
        "<b>DATA_DIR</b> (default: system temp)<br>"
        '<span style="font-size:11px;">uploads/&lt;id&gt;.pdf<br>results/&lt;id&gt;/n.pdf<br>'
        "results/jobs/&lt;id&gt;.json</span>",
        "shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;"
        f"fillColor=#F6FBEA;strokeColor={STORAGE};fontSize=12;",
        360, 890, 230, 150,
    )

    p.edge(curl, app, "HTTP :3000", exit=(1, 0.5), entry=(0, frac(325, 190, 200)))
    p.edge(app, jobs, "submit · view", exit=(1, 0.5), entry=(0, 0.5))
    p.edge(jobs, queue, "send {jobId}", exit=(1, 0.3), entry=(0, 0.3))
    p.edge(queue, jobs, "consume →<br>process", color=GREY, exit=(0, 0.75), entry=(1, 0.75))
    p.edge(jobs, pipe, "flatten(pdf, recipients)", exit=(frac(900, 690, 270), 1),
           entry=(frac(900, 800, 590), 0))
    p.edge(jobs, store, "put / get / delete", color=STORAGE, exit=(frac(738, 690, 270), 1),
           entry=(1, 0.5), points=((738, 620),))
    p.edge(app, store, "verify signature", color=STORAGE, exit=(0.5, 1), entry=(0.5, 0))
    p.edge(r, w, "", color=COMPUTE, exit=(1, 0.5), entry=(0, 0.5))
    p.edge(w, b, "", color=COMPUTE, exit=(1, 0.5), entry=(0, 0.5))
    p.edge(store, disk, "fs read / write", color=STORAGE, exit=(0.5, 1), entry=(0.5, 0))

    p.box(
        1480, 100, 390, 260,
        "<b>The only seam: src/runtime.js</b><br><br>"
        "<b>QUEUE_URL unset</b> (local)<br>storage/local.js: disk + in-process queue<br><br>"
        "<b>QUEUE_URL set</b> (AWS)<br>storage/aws.js: S3 + SQS. The API runs src/server.js "
        "in a container; the worker runs src/worker/lambda.js, an SQS handler around the same "
        "jobs.process<br><br>"
        "http/, jobs.js and pdf/ are identical in both modes.",
        fill="#f5f5f5", stroke="#999999", align="left", valign="top", dashed=True,
    )
    p.box(
        1480, 400, 390, 230,
        "<b>npm test</b> (node:test, no heavy framework)<br><br>"
        "Generates a text PDF with pdf-lib and runs the real pipeline and API in-process:<br>"
        "• page count matches<br>• pdfjs text extraction on the output returns nothing<br>"
        "• watermark pixels are present, absent with watermark=false<br>"
        "• non-PDF and missing key are rejected<br>• SQS handler reports only failed messages",
        fill="#D5E8D4", stroke="#82B366", align="left", valign="top",
    )
    p.box(
        1480, 670, 390, 120,
        "<b>Run it</b><br>"
        '<span style="font-family:monospace;font-size:11px;">npm ci<br>cp .env.example .env<br>'
        "npm start<br>npm test</span>",
        fill="#FFF2CC", stroke="#D6B656", align="left", valign="top",
    )
    return p


def main() -> None:
    pages = [aws_architecture(), job_flow(), local_dev()]
    OUT.write_text(
        '<mxfile host="gen_drawio.py">' + "".join(pg.xml() for pg in pages) + "</mxfile>\n",
        encoding="utf-8",
    )
    print(OUT)


if __name__ == "__main__":
    main()
