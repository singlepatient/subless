// import ElementOverlay, { ElementOverlayParams } from "../services/element-overlay";

// export default class SRSController {
//     private readonly video: HTMLMediaElement;
//     private SRSOverlay: ElementOverlay;

//     constructor(video: HTMLMediaElement) {
//         this.video = video;
//         this.SRSOverlay = new ElementOverlay(this.video);
//     }

//     public getOverlay(): ElementOverlay {
//         return this.SRSOverlay;
//     }
    
//     public applyOverlayParams(params: ElementOverlayParams) {
//         this._applyElementOverlayParams(this.SRSOverlay, params);
//     }   

//     private _applyElementOverlayParams(overlay: ElementOverlay, params: ElementOverlayParams) {
//         overlay.offsetAnchor = params.offsetAnchor;
//         overlay.fullscreenContainerClassName = params.fullscreenContainerClassName;
//         overlay.fullscreenContentClassName = params.fullscreenContentClassName;
//         overlay.nonFullscreenContainerClassName = params.nonFullscreenContainerClassName;
//         overlay.nonFullscreenContentClassName = params.nonFullscreenContentClassName;
//     }

//     private _setSRSHtml() {
//         this.SRSOverlay.setHtml(this._buildSRSHtml());
//     }

//     private _buildSRSHtml() {
//         // Buttons: Replay, Show subtitles
//         // Interactive: Upon clicking show answer, reveals subtitles and offers button options
//         // for pass and fail
//     }
// }