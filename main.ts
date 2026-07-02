import { addIcon, App, MarkdownView, Modal, Notice, Plugin, setIcon } from "obsidian";

const TOOLBAR_CONTAINER_CLASS = "image-toolbar-container";
const TOOLBAR_VISIBLE_CLASS = "visible";
const TOOLBAR_BTN_CLASS = "image-toolbar-btn";
const CROP_BTN_HIDDEN_CLASS = "image-toolbar-crop-hidden";
const CANVAS_HIDDEN_CLASS = "image-toolbar-canvas-hidden";
const BODY_OVERFLOW_HIDDEN_CLASS = "image-toolbar-overflow-hidden";

const FULLSCREEN_OVERLAY_CLASS = "image-fullscreen-overlay";
const FULLSCREEN_CLOSE_CLASS = "image-fullscreen-close";

interface CMEditorView {
	posAtDOM(node: Node): number;
}

interface VaultAdapter {
	getBasePath?(): string;
	basePath?: string;
}

interface CropRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export default class ImageToolbarPlugin extends Plugin {
	private toolbar: HTMLElement | null = null;
	private cropBtn: HTMLElement | null = null;
	private currentImg: HTMLImageElement | null = null;
	private hideTimer: ReturnType<typeof setTimeout> | null = null;

	async onload() {
		addIcon("image-toolbar-copy", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`);
		addIcon("image-toolbar-crop", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"></path><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"></path></svg>`);
		addIcon("image-toolbar-fullscreen", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`);
		addIcon("image-toolbar-close", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`);

		this.createToolbar();
		this.registerDocListeners();
	}

	onunload() {
		this.clearHideTimer();
		this.toolbar?.remove();
		this.toolbar = null;
	}

	private createToolbar() {
		const container = document.body.createDiv(TOOLBAR_CONTAINER_CLASS);

		const copyBtn = container.createEl("button", { cls: TOOLBAR_BTN_CLASS });
		setIcon(copyBtn, "image-toolbar-copy");
		copyBtn.setAttribute("aria-label", "Copy image");
		copyBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			if (this.currentImg) void this.copyImage(this.currentImg);
		});

		const cropBtn = container.createEl("button", { cls: TOOLBAR_BTN_CLASS });
		setIcon(cropBtn, "image-toolbar-crop");
		cropBtn.setAttribute("aria-label", "Crop image");
		cropBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			if (this.currentImg) this.openCropModal(this.currentImg);
		});

		const fullscreenBtn = container.createEl("button", { cls: TOOLBAR_BTN_CLASS });
		setIcon(fullscreenBtn, "image-toolbar-fullscreen");
		fullscreenBtn.setAttribute("aria-label", "Fullscreen image");
		fullscreenBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			if (this.currentImg) this.openFullscreen(this.currentImg);
		});

		container.addEventListener("mouseenter", () => {
			this.clearHideTimer();
		});
		container.addEventListener("mouseleave", () => {
			this.scheduleHide();
		});

		this.toolbar = container;
		this.cropBtn = cropBtn;
	}

	private registerDocListeners() {
		const doc = document;

		const onMouseOver = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (target.tagName === "IMG") {
				this.showToolbar(target as HTMLImageElement);
			}
		};

		const onMouseOut = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (target.tagName === "IMG") {
				this.scheduleHide();
			}
		};

		const onScroll = () => {
			this.hideToolbar();
		};

		doc.addEventListener("mouseover", onMouseOver, true);
		doc.addEventListener("mouseout", onMouseOut, true);
		doc.addEventListener("scroll", onScroll, true);

		this.register(() => {
			doc.removeEventListener("mouseover", onMouseOver, true);
			doc.removeEventListener("mouseout", onMouseOut, true);
			doc.removeEventListener("scroll", onScroll, true);
		});
	}

	private isInLivePreview(img: HTMLElement): boolean {
		let el: HTMLElement | null = img;
		while (el) {
			if (el.matches(".cm-content, .cm-editor")) return true;
			if (el.matches(".markdown-reading-view, .markdown-preview-view")) return false;
			el = el.parentElement;
		}
		return false;
	}

	private showToolbar(img: HTMLImageElement) {
		this.clearHideTimer();
		this.currentImg = img;
		if (!this.toolbar) return;

		const inLivePreview = this.isInLivePreview(img);
		if (this.cropBtn) {
			this.cropBtn.classList.toggle(CROP_BTN_HIDDEN_CLASS, !inLivePreview);
		}

		const rect = img.getBoundingClientRect();
		const toolbarW = this.toolbar.offsetWidth || 120;
		const toolbarH = this.toolbar.offsetHeight || 40;
		const gap = 4;

		let left = rect.left + rect.width / 2 - toolbarW / 2;
		let top = rect.top - toolbarH - gap;

		if (top < 8) {
			top = rect.bottom + gap;
		}
		if (left < 8) left = 8;
		if (left + toolbarW > window.innerWidth - 8) {
			left = window.innerWidth - toolbarW - 8;
		}

		this.toolbar.setCssProps?.({ left: `${left}px`, top: `${top}px` });
		this.toolbar.classList.add(TOOLBAR_VISIBLE_CLASS);
	}

	private hideToolbar() {
		this.currentImg = null;
		this.toolbar?.classList.remove(TOOLBAR_VISIBLE_CLASS);
	}

	private scheduleHide() {
		this.clearHideTimer();
		this.hideTimer = window.setTimeout(() => {
			this.hideToolbar();
		}, 300);
	}

	private clearHideTimer() {
		if (this.hideTimer) {
			window.clearTimeout(this.hideTimer);
			this.hideTimer = null;
		}
	}

	private async copyImage(img: HTMLImageElement) {
		try {
			const blob = await this.imgToBlob(img);
			if (!blob) {
				new Notice("Failed to load image for copying");
				return;
			}
			await navigator.clipboard.write([
				new ClipboardItem({ [blob.type]: blob }),
			]);
			new Notice("Image copied to clipboard");
		} catch (err) {
			console.error("Copy failed:", err);
			new Notice("Copy failed");
		}
	}

	private openCropModal(img: HTMLImageElement) {
		new CropModal(this.app, img.src, (blob, ext) => {
			this.saveCroppedImage(blob, ext, img);
		}).open();
	}

	private openFullscreen(img: HTMLImageElement) {
		new FullscreenOverlay(img.src).open();
	}

	private async saveCroppedImage(blob: Blob, ext: string, img: HTMLImageElement) {
		const src = img.src;
		let savePath = "";
		try {
			const arrayBuffer = await blob.arrayBuffer();

			let folder = "";
			let baseName = "";

			if (this.isVaultImage(src)) {
				const vaultPath = this.getVaultPathFromSrc(src);
				if (vaultPath) {
					const lastSlash = vaultPath.lastIndexOf("/");
					folder = lastSlash >= 0 ? vaultPath.substring(0, lastSlash) : "";
					const fileName = lastSlash >= 0 ? vaultPath.substring(lastSlash + 1) : vaultPath;
					const dotIdx = fileName.lastIndexOf(".");
					baseName = dotIdx >= 0 ? fileName.substring(0, dotIdx) : fileName;
				}
			}

			if (!baseName) {
				const url = new URL(src);
				const pathParts = url.pathname.split("/");
				const rawName = pathParts[pathParts.length - 1] || `image_${Date.now()}`;
				const dotIdx = rawName.lastIndexOf(".");
				baseName = dotIdx >= 0 ? rawName.substring(0, dotIdx) : rawName;
				if (!ext.startsWith(".")) ext = "." + ext;
			}

			savePath = folder ? `${folder}/${baseName}_crop${ext}` : `${baseName}_crop${ext}`;
			let counter = 1;
			while (true) {
				const exists = this.app.vault.getAbstractFileByPath(savePath);
				if (!exists) break;
				savePath = folder
					? `${folder}/${baseName}_crop${counter}${ext}`
					: `${baseName}_crop${counter}${ext}`;
				counter++;
			}

			console.log("[image-toolbar] savePath:", savePath);
			await this.app.vault.createBinary(savePath, arrayBuffer);
			new Notice(`Saved: ${savePath}`);
			this.replaceImageRefInNote(img, savePath);
		} catch (err) {
			console.error("Save cropped image failed:", err, { savePath, src });
			new Notice("Failed to save cropped image");
		}
	}

	private isVaultImage(src: string): boolean {
		return src.includes("app://");
	}

	private getVaultPathFromSrc(src: string): string | null {
		try {
			const url = new URL(src);
			let pathname = decodeURIComponent(url.pathname);
			const qIdx = pathname.indexOf("?");
			if (qIdx >= 0) pathname = pathname.substring(0, qIdx);

			const adapter = this.app.vault.adapter as unknown as VaultAdapter;
			const basePath = adapter?.getBasePath?.() || adapter?.basePath;
			if (basePath) {
				const normBase = basePath.replace(/\\/g, "/");
				const normPath = pathname.replace(/\\/g, "/");
				if (normPath.startsWith(normBase)) {
					pathname = normPath.slice(normBase.length);
				} else if (normPath.startsWith("/" + normBase)) {
					pathname = normPath.slice(normBase.length + 1);
				}
			}
			if (pathname.startsWith("/")) {
				pathname = pathname.slice(1);
			}
			return pathname;
		} catch {
			return null;
		}
	}

	private replaceImageRefInNote(img: HTMLImageElement, croppedPath: string) {
		if (!this.isInLivePreview(img)) return;

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		const cm = (view.editor as unknown as { cm?: CMEditorView }).cm;
		if (!cm || !cm.posAtDOM) return;

		const pos = cm.posAtDOM(img);
		if (pos == null || pos < 0) return;

		const editor = view.editor;
		const endPos = editor.offsetToPos(pos);

		const lineText = editor.getLine(endPos.line);
		const prefix = lineText.substring(0, endPos.ch);

		const wikiIdx = prefix.lastIndexOf("![[");
		const mdIdx = prefix.lastIndexOf("![");

		if (wikiIdx >= 0) {
			const refText = lineText.substring(wikiIdx, endPos.ch);
			const src = img.src;
			const origPath = this.getVaultPathFromSrc(src);
			if (!origPath) return;
			const origName = origPath.includes("/") ? origPath.substring(origPath.lastIndexOf("/") + 1) : origPath;
			const cropName = croppedPath.includes("/") ? croppedPath.substring(croppedPath.lastIndexOf("/") + 1) : croppedPath;
			const newRef = refText.replace(origName, cropName);
			if (newRef === refText) return;

			editor.replaceRange(newRef, { line: endPos.line, ch: wikiIdx }, { line: endPos.line, ch: endPos.ch });
		} else if (mdIdx >= 0) {
			const refText = lineText.substring(mdIdx, endPos.ch);
			const src = img.src;
			const origPath = this.getVaultPathFromSrc(src);
			if (!origPath) return;
			const origName = origPath.includes("/") ? origPath.substring(origPath.lastIndexOf("/") + 1) : origPath;
			const cropName = croppedPath.includes("/") ? croppedPath.substring(croppedPath.lastIndexOf("/") + 1) : croppedPath;
			const newRef = refText.replace(origName, cropName);
			if (newRef === refText) return;

			editor.replaceRange(newRef, { line: endPos.line, ch: mdIdx }, { line: endPos.line, ch: endPos.ch });
		}
	}

	private imgToBlob(img: HTMLImageElement): Promise<Blob | null> {
		return new Promise((resolve) => {
			const canvas = document.createElement("canvas");
			canvas.width = img.naturalWidth;
			canvas.height = img.naturalHeight;
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				resolve(null);
				return;
			}

			if (img.complete && img.naturalWidth > 0) {
				ctx.drawImage(img, 0, 0);
				canvas.toBlob((b) => resolve(b));
				return;
			}

			const proxy = new Image();
			proxy.crossOrigin = "anonymous";
			proxy.onload = () => {
				ctx.drawImage(proxy, 0, 0);
				canvas.toBlob((b) => resolve(b));
			};
			proxy.onerror = () => resolve(null);
			proxy.src = img.src;
		});
	}
}

class CropModal extends Modal {
	private imgSrc: string;
	private onSave: (blob: Blob, ext: string) => void;

	private wrapper: HTMLElement | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private imageEl: HTMLImageElement | null = null;

	private xInput: HTMLInputElement | null = null;
	private yInput: HTMLInputElement | null = null;
	private wInput: HTMLInputElement | null = null;
	private hInput: HTMLInputElement | null = null;

	private crop: CropRect = { x: 0, y: 0, width: 0, height: 0 };
	private imgNaturalW = 0;
	private imgNaturalH = 0;
	private displayScale = 1;

	private dragging = false;
	private dragType: "new" | "move" | "resize" = "new";
	private handleIndex = -1;
	private dragStart = { x: 0, y: 0 };
	private cropAtDragStart: CropRect = { x: 0, y: 0, width: 0, height: 0 };

	private readonly HANDLE_SIZE = 8;

	constructor(app: App, imgSrc: string, onSave: (blob: Blob, ext: string) => void) {
		super(app);
		this.imgSrc = imgSrc;
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		const root = contentEl.createDiv("image-crop-modal");
		root.createDiv("image-crop-modal-title").setText("Crop Image");

		const wrapper = root.createDiv("image-crop-canvas-wrapper");
		this.wrapper = wrapper;

		this.canvas = wrapper.createEl("canvas");
		this.canvas.classList.add(CANVAS_HIDDEN_CLASS);

		const controls = root.createDiv("image-crop-controls");
		const addField = (label: string, id: string) => {
			const lbl = controls.createEl("label");
			lbl.setText(label);
			const input = lbl.createEl("input");
			input.type = "number";
			input.id = id;
			input.min = "0";
			input.addEventListener("input", () => this.onInputChange());
			return input;
		};

		this.xInput = addField("X", "crop-x");
		this.yInput = addField("Y", "crop-y");
		this.wInput = addField("W", "crop-w");
		this.hInput = addField("H", "crop-h");

		const btnRow = root.createDiv("image-crop-buttons");
		const confirmBtn = btnRow.createEl("button", {
			cls: "image-crop-confirm",
			text: "Confirm",
		});
		confirmBtn.addEventListener("click", () => this.doCrop());

		const cancelBtn = btnRow.createEl("button", {
			cls: "image-crop-cancel",
			text: "Cancel",
		});
		cancelBtn.addEventListener("click", () => this.close());

		void this.loadImage();
	}

	onClose() {
		this.contentEl.empty();
		this.canvas = null;
		this.wrapper = null;
		this.imageEl = null;
	}

	private async loadImage() {
		const img = new Image();
		if (this.imgSrc.startsWith("http://") || this.imgSrc.startsWith("https://")) {
			img.crossOrigin = "anonymous";
		}
		img.onload = () => {
			this.imageEl = img;
			this.imgNaturalW = img.naturalWidth;
			this.imgNaturalH = img.naturalHeight;
			this.initCanvas();
			this.setupCanvasEvents();
		};
		img.onerror = () => {
			new Notice("Failed to load image for cropping");
			this.close();
		};
		img.src = this.imgSrc;
	}

	private initCanvas() {
		if (!this.canvas || !this.wrapper || !this.imageEl) return;

		const maxW = Math.min(this.wrapper.clientWidth - 16, 800);
		const maxH = Math.min(window.innerHeight * 0.55, 600);

		let dispW = this.imgNaturalW;
		let dispH = this.imgNaturalH;

		if (dispW > maxW || dispH > maxH) {
			const scale = Math.min(maxW / dispW, maxH / dispH);
			dispW = Math.round(dispW * scale);
			dispH = Math.round(dispH * scale);
		}

		this.displayScale = dispW / this.imgNaturalW;

		this.canvas.width = dispW;
		this.canvas.height = dispH;
		this.canvas.classList.remove(CANVAS_HIDDEN_CLASS);

		this.drawCanvas();

		this.crop = {
			x: Math.round(dispW * 0.1),
			y: Math.round(dispH * 0.1),
			width: Math.round(dispW * 0.8),
			height: Math.round(dispH * 0.8),
		};
		this.updateInputs();
		this.drawCanvas();
	}

	private drawCanvas() {
		if (!this.canvas || !this.imageEl) return;
		const ctx = this.canvas.getContext("2d");
		if (!ctx) return;

		ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		ctx.drawImage(this.imageEl, 0, 0, this.canvas.width, this.canvas.height);

		this.drawCropOverlay(ctx);
	}

	private drawCropOverlay(ctx: CanvasRenderingContext2D) {
		const w = this.canvas!.width;
		const h = this.canvas!.height;
		const r = this.crop;

		ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
		ctx.fillRect(0, 0, w, r.y);
		ctx.fillRect(0, r.y, r.x, r.height);
		ctx.fillRect(r.x + r.width, r.y, w - r.x - r.width, r.height);
		ctx.fillRect(0, r.y + r.height, w, h - r.y - r.height);

		ctx.strokeStyle = "#fff";
		ctx.lineWidth = 2;
		ctx.setLineDash([6, 3]);
		ctx.strokeRect(r.x, r.y, r.width, r.height);
		ctx.setLineDash([]);

		this.drawHandles(ctx, r);
	}

	private drawHandles(ctx: CanvasRenderingContext2D, r: CropRect) {
		const hs = this.HANDLE_SIZE;
		const half = hs / 2;
		const handles = [
			{ x: r.x, y: r.y },
			{ x: r.x + r.width / 2, y: r.y },
			{ x: r.x + r.width, y: r.y },
			{ x: r.x + r.width, y: r.y + r.height / 2 },
			{ x: r.x + r.width, y: r.y + r.height },
			{ x: r.x + r.width / 2, y: r.y + r.height },
			{ x: r.x, y: r.y + r.height },
			{ x: r.x, y: r.y + r.height / 2 },
		];

		ctx.fillStyle = "#fff";
		ctx.strokeStyle = "rgba(0,0,0,0.5)";
		ctx.lineWidth = 1;
		for (const hdl of handles) {
			ctx.fillRect(hdl.x - half, hdl.y - half, hs, hs);
			ctx.strokeRect(hdl.x - half, hdl.y - half, hs, hs);
		}
	}

	private getHandleAt(mx: number, my: number): number {
		const r = this.crop;
		const hs = this.HANDLE_SIZE;
		const half = hs / 2 + 2;
		const handles = [
			{ x: r.x, y: r.y },
			{ x: r.x + r.width / 2, y: r.y },
			{ x: r.x + r.width, y: r.y },
			{ x: r.x + r.width, y: r.y + r.height / 2 },
			{ x: r.x + r.width, y: r.y + r.height },
			{ x: r.x + r.width / 2, y: r.y + r.height },
			{ x: r.x, y: r.y + r.height },
			{ x: r.x, y: r.y + r.height / 2 },
		];
		for (let i = 0; i < handles.length; i++) {
			if (
				mx >= handles[i].x - half &&
				mx <= handles[i].x + half &&
				my >= handles[i].y - half &&
				my <= handles[i].y + half
			) {
				return i;
			}
		}
		return -1;
	}

	private setupCanvasEvents() {
		if (!this.canvas) return;

		const getPos = (e: MouseEvent) => {
			const rect = this.canvas!.getBoundingClientRect();
			return { x: e.clientX - rect.left, y: e.clientY - rect.top };
		};

		const onDown = (e: MouseEvent) => {
			const pos = getPos(e);
			const insideCrop =
				pos.x >= this.crop.x &&
				pos.x <= this.crop.x + this.crop.width &&
				pos.y >= this.crop.y &&
				pos.y <= this.crop.y + this.crop.height;

			const hIdx = this.getHandleAt(pos.x, pos.y);

			if (hIdx >= 0) {
				this.dragging = true;
				this.dragType = "resize";
				this.handleIndex = hIdx;
			} else if (insideCrop) {
				this.dragging = true;
				this.dragType = "move";
			} else {
				this.dragging = true;
				this.dragType = "new";
				this.crop = { x: pos.x, y: pos.y, width: 0, height: 0 };
			}

			this.dragStart = { x: pos.x, y: pos.y };
			this.cropAtDragStart = { ...this.crop };
		};

		const onMove = (e: MouseEvent) => {
			if (!this.dragging) return;
			const pos = getPos(e);
			const dx = pos.x - this.dragStart.x;
			const dy = pos.y - this.dragStart.y;

			if (this.dragType === "new") {
				this.crop.x = Math.min(this.dragStart.x, pos.x);
				this.crop.y = Math.min(this.dragStart.y, pos.y);
				this.crop.width = Math.abs(dx);
				this.crop.height = Math.abs(dy);
			} else if (this.dragType === "move") {
				this.crop.x = this.clamp(0, this.cropAtDragStart.x + dx, this.canvas!.width - this.crop.width);
				this.crop.y = this.clamp(0, this.cropAtDragStart.y + dy, this.canvas!.height - this.crop.height);
			} else if (this.dragType === "resize") {
				this.resizeCrop(this.handleIndex, dx, dy);
			}

			this.normalizeCrop();
			this.updateInputs();
			this.drawCanvas();
		};

		const onUp = () => {
			this.dragging = false;
		};

		this.canvas.addEventListener("mousedown", onDown);
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);

		this.registerDomEvent(this.canvas, "mousedown", onDown);
	}

	private resizeCrop(handleIdx: number, dx: number, dy: number) {
		const orig = this.cropAtDragStart;
		switch (handleIdx) {
			case 0: // top-left
				this.crop.x = orig.x + dx;
				this.crop.y = orig.y + dy;
				this.crop.width = orig.width - dx;
				this.crop.height = orig.height - dy;
				break;
			case 1: // top-center
				this.crop.y = orig.y + dy;
				this.crop.height = orig.height - dy;
				break;
			case 2: // top-right
				this.crop.y = orig.y + dy;
				this.crop.width = orig.width + dx;
				this.crop.height = orig.height - dy;
				break;
			case 3: // middle-right
				this.crop.width = orig.width + dx;
				break;
			case 4: // bottom-right
				this.crop.width = orig.width + dx;
				this.crop.height = orig.height + dy;
				break;
			case 5: // bottom-center
				this.crop.height = orig.height + dy;
				break;
			case 6: // bottom-left
				this.crop.x = orig.x + dx;
				this.crop.width = orig.width - dx;
				this.crop.height = orig.height + dy;
				break;
			case 7: // middle-left
				this.crop.x = orig.x + dx;
				this.crop.width = orig.width - dx;
				break;
		}
	}

	private normalizeCrop() {
		if (this.crop.width < 10) this.crop.width = 10;
		if (this.crop.height < 10) this.crop.height = 10;
		if (this.crop.x < 0) {
			this.crop.width += this.crop.x;
			this.crop.x = 0;
		}
		if (this.crop.y < 0) {
			this.crop.height += this.crop.y;
			this.crop.y = 0;
		}
		if (!this.canvas) return;
		if (this.crop.x + this.crop.width > this.canvas.width) {
			this.crop.width = this.canvas.width - this.crop.x;
		}
		if (this.crop.y + this.crop.height > this.canvas.height) {
			this.crop.height = this.canvas.height - this.crop.y;
		}
	}

	private updateInputs() {
		const r = this.crop;
		const s = 1 / this.displayScale;
		if (this.xInput) this.xInput.value = String(Math.round(r.x * s));
		if (this.yInput) this.yInput.value = String(Math.round(r.y * s));
		if (this.wInput) this.wInput.value = String(Math.round(r.width * s));
		if (this.hInput) this.hInput.value = String(Math.round(r.height * s));
	}

	private onInputChange() {
		const s = this.displayScale;
		if (!this.canvas) return;

		const x = Math.round((parseFloat(this.xInput?.value || "0") || 0) * s);
		const y = Math.round((parseFloat(this.yInput?.value || "0") || 0) * s);
		const w = Math.max(10, Math.round((parseFloat(this.wInput?.value || "10") || 10) * s));
		const h = Math.max(10, Math.round((parseFloat(this.hInput?.value || "10") || 10) * s));

		this.crop = {
			x: this.clamp(0, x, this.canvas.width - 10),
			y: this.clamp(0, y, this.canvas.height - 10),
			width: Math.min(w, this.canvas.width - x),
			height: Math.min(h, this.canvas.height - y),
		};

		this.drawCanvas();
	}

	private doCrop() {
		if (!this.imageEl) return;

		const s = 1 / this.displayScale;
		const sx = Math.round(this.crop.x * s);
		const sy = Math.round(this.crop.y * s);
		const sw = Math.round(this.crop.width * s);
		const sh = Math.round(this.crop.height * s);

		const outCanvas = document.createElement("canvas");
		outCanvas.width = sw;
		outCanvas.height = sh;
		const ctx = outCanvas.getContext("2d");
		if (!ctx) return;

		ctx.drawImage(this.imageEl, sx, sy, sw, sh, 0, 0, sw, sh);

		const ext = this.guessExt(this.imgSrc);

		outCanvas.toBlob((blob) => {
			if (blob) {
				this.onSave(blob, ext);
			} else {
				new Notice("Failed to export cropped image (canvas tainted)");
			}
			this.close();
		}, "image/" + (ext === "jpg" ? "jpeg" : ext.replace(".", "")));
	}

	private guessExt(src: string): string {
		try {
			const url = new URL(src);
			const pathname = decodeURIComponent(url.pathname);
			const m = pathname.match(/\.([a-z0-9]+)$/i);
			if (m) return "." + m[1].toLowerCase();
		} catch {
			// fall through to default .png
		}
		return ".png";
	}

	private clamp(min: number, val: number, max: number): number {
		return Math.max(min, Math.min(val, max));
	}
}

class FullscreenOverlay {
	private overlay: HTMLElement;
	private imgSrc: string;

	constructor(imgSrc: string) {
		this.imgSrc = imgSrc;

		this.overlay = document.body.createDiv(FULLSCREEN_OVERLAY_CLASS);
		this.overlay.addEventListener("click", () => this.close());

		const img = this.overlay.createEl("img");
		img.src = imgSrc;

		const closeBtn = this.overlay.createEl("button", { cls: FULLSCREEN_CLOSE_CLASS });
		setIcon(closeBtn, "image-toolbar-close");
		closeBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.close();
		});

		document.addEventListener("keydown", this.onKeyDown, true);
	}

	open() {
		document.body.classList.add(BODY_OVERFLOW_HIDDEN_CLASS);
	}

	close() {
		document.body.classList.remove(BODY_OVERFLOW_HIDDEN_CLASS);
		this.overlay.remove();
		document.removeEventListener("keydown", this.onKeyDown, true);
	}

	private onKeyDown = (e: KeyboardEvent) => {
		if (e.key === "Escape") {
			this.close();
		}
	};
}
