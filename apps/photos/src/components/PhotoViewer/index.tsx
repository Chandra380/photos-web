import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import Photoswipe from 'photoswipe';
import PhotoswipeUIDefault from 'photoswipe/dist/photoswipe-ui-default';
import classnames from 'classnames';
import {
    addToFavorites,
    removeFromFavorites,
} from 'services/collectionService';
import { EnteFile } from 'types/file';
import {
    copyFileToClipboard,
    getFileExtension,
    getFileFromURL,
    isSupportedRawFormat,
    isRawFile,
    downloadSingleFile,
} from 'utils/file';
import { logError } from '@ente/shared/sentry';

import { FILE_TYPE } from 'constants/file';
import { isClipboardItemPresent } from 'utils/common';
import { playVideo, pauseVideo } from 'utils/photoFrame';
import { PublicCollectionGalleryContext } from 'utils/publicCollectionGallery';
import { AppContext } from 'pages/_app';
import { FileInfo } from './FileInfo';
import {
    defaultLivePhotoDefaultOptions,
    photoSwipeV4Events,
} from 'constants/photoViewer';
import { LivePhotoBtnContainer } from './styledComponents/LivePhotoBtn';
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ZoomInOutlinedIcon from '@mui/icons-material/ZoomInOutlined';
import FullscreenOutlinedIcon from '@mui/icons-material/FullscreenOutlined';
import InfoIcon from '@mui/icons-material/InfoOutlined';
import FavoriteIcon from '@mui/icons-material/FavoriteRounded';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorderRounded';
import FullscreenExitOutlinedIcon from '@mui/icons-material/FullscreenExitOutlined';
import ChevronRight from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import { trashFiles } from 'services/fileService';
import { getTrashFileMessage } from 'utils/ui';
import { Box, Button, styled } from '@mui/material';
import { addLocalLog } from '@ente/shared/logging';
import ContentCopy from '@mui/icons-material/ContentCopy';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import { t } from 'i18next';
import { getParsedExifData } from 'services/upload/exifService';
import { getFileType } from 'services/typeDetectionService';
import { ConversionFailedNotification } from './styledComponents/ConversionFailedNotification';
import { GalleryContext } from 'pages/gallery';
import downloadManager, { LoadedLivePhotoSourceURL } from 'services/download';
import CircularProgressWithLabel from './styledComponents/CircularProgressWithLabel';
import EnteSpinner from '@ente/shared/components/EnteSpinner';
import AlbumOutlined from '@mui/icons-material/AlbumOutlined';
import { FlexWrapper } from '@ente/shared/components/Container';
import isElectron from 'is-electron';
import ReplayIcon from '@mui/icons-material/Replay';
import ImageEditorOverlay from './ImageEditorOverlay';
import EditIcon from '@mui/icons-material/Edit';
import { SetFilesDownloadProgressAttributesCreator } from 'types/gallery';

interface PhotoswipeFullscreenAPI {
    enter: () => void;
    exit: () => void;
    isFullscreen: () => boolean;
}

const CaptionContainer = styled('div')(({ theme }) => ({
    padding: theme.spacing(2),
    wordBreak: 'break-word',
    textAlign: 'right',
    maxWidth: '375px',
    fontSize: '14px',
    lineHeight: '17px',
    backgroundColor: theme.colors.backdrop.faint,
    backdropFilter: `blur(${theme.colors.blur.base})`,
}));
interface Iprops {
    isOpen: boolean;
    items: any[];
    currentIndex?: number;
    onClose?: (needUpdate: boolean) => void;
    gettingData: (instance: any, index: number, item: EnteFile) => void;
    getConvertedItem: (instance: any, index: number, item: EnteFile) => void;
    id?: string;
    className?: string;
    favItemIds: Set<number>;
    tempDeletedFileIds: Set<number>;
    setTempDeletedFileIds?: (value: Set<number>) => void;
    isTrashCollection: boolean;
    isInHiddenSection: boolean;
    enableDownload: boolean;
    fileToCollectionsMap: Map<number, number[]>;
    collectionNameMap: Map<number, string>;
    setFilesDownloadProgressAttributesCreator: SetFilesDownloadProgressAttributesCreator;
}

function PhotoViewer(props: Iprops) {
    const galleryContext = useContext(GalleryContext);
    const appContext = useContext(AppContext);
    const publicCollectionGalleryContext = useContext(
        PublicCollectionGalleryContext
    );

    const { isOpen, items } = props;

    const pswpElement = useRef<HTMLDivElement>();
    const [photoSwipe, setPhotoSwipe] =
        useState<Photoswipe<Photoswipe.Options>>();
    const [isFav, setIsFav] = useState(false);
    const [showInfo, setShowInfo] = useState(false);
    const [exif, setExif] =
        useState<{ key: string; value: Record<string, any> }>();
    const exifCopy = useRef(null);
    const [livePhotoBtnOptions, setLivePhotoBtnOptions] = useState(
        defaultLivePhotoDefaultOptions
    );
    const [isOwnFile, setIsOwnFile] = useState(false);
    const [showConvertBtn, setShowConvertBtn] = useState(false);
    const [isSourceLoaded, setIsSourceLoaded] = useState(false);
    const [isInFullScreenMode, setIsInFullScreenMode] = useState(false);

    const needUpdate = useRef(false);
    const exifExtractionInProgress = useRef<string>(null);
    const shouldShowCopyOption = useMemo(() => isClipboardItemPresent(), []);

    const [showImageEditorOverlay, setShowImageEditorOverlay] = useState(false);

    const [
        conversionFailedNotificationOpen,
        setConversionFailedNotificationOpen,
    ] = useState(false);

    const [fileDownloadProgress, setFileDownloadProgress] = useState<
        Map<number, number>
    >(new Map());

    const [showEditButton, setShowEditButton] = useState(false);

    const [showZoomButton, setShowZoomButton] = useState(false);

    useEffect(() => {
        downloadManager.setProgressUpdater(setFileDownloadProgress);
    }, []);

    useEffect(() => {
        if (!pswpElement) return;
        if (isOpen) {
            openPhotoSwipe();
        }
        if (!isOpen) {
            closePhotoSwipe();
        }
        return () => {
            closePhotoSwipe();
        };
    }, [isOpen]);

    useEffect(() => {
        if (!photoSwipe) return;
        function handleCopyEvent() {
            if (!isOpen || showInfo) {
                return;
            }
            copyToClipboardHelper(photoSwipe.currItem as EnteFile);
        }

        function handleKeyUp(event: KeyboardEvent) {
            if (!isOpen || showInfo) {
                return;
            }

            addLocalLog(() => 'Event: ' + event.key);

            switch (event.key) {
                case 'i':
                case 'I':
                    setShowInfo(true);
                    break;
                case 'Backspace':
                case 'Delete':
                    confirmTrashFile(photoSwipe?.currItem as EnteFile);
                    break;
                case 'd':
                case 'D':
                    downloadFileHelper(photoSwipe?.currItem as EnteFile);
                    break;
                case 'f':
                case 'F':
                    toggleFullscreen(photoSwipe);
                    break;
                case 'l':
                case 'L':
                    onFavClick(photoSwipe?.currItem as EnteFile);
                    break;
                case 'ArrowLeft':
                    handleArrowClick(event, 'left');
                    break;
                case 'ArrowRight':
                    handleArrowClick(event, 'right');
                    break;
                default:
                    break;
            }
        }

        window.addEventListener('keyup', handleKeyUp);
        if (shouldShowCopyOption) {
            window.addEventListener('copy', handleCopyEvent);
        }
        return () => {
            window.removeEventListener('keyup', handleKeyUp);
            if (shouldShowCopyOption) {
                window.removeEventListener('copy', handleCopyEvent);
            }
        };
    }, [isOpen, photoSwipe, showInfo]);

    useEffect(() => {
        if (photoSwipe) {
            photoSwipe.options.escKey = !showInfo;
        }
    }, [showInfo]);

    useEffect(() => {
        if (!isOpen) return;
        const item = items[photoSwipe?.getCurrentIndex()];
        if (!item) return;
        if (item.metadata.fileType === FILE_TYPE.LIVE_PHOTO) {
            const getVideoAndImage = () => {
                const video = document.getElementById(
                    `live-photo-video-${item.id}`
                );
                const image = document.getElementById(
                    `live-photo-image-${item.id}`
                );
                return { video, image };
            };

            const { video, image } = getVideoAndImage();

            if (video && image) {
                setLivePhotoBtnOptions({
                    click: async () => {
                        await playVideo(video, image);
                    },
                    hide: async () => {
                        await pauseVideo(video, image);
                    },
                    show: async () => {
                        await playVideo(video, image);
                    },
                    visible: true,
                    loading: false,
                });
            } else {
                setLivePhotoBtnOptions({
                    ...defaultLivePhotoDefaultOptions,
                    visible: true,
                    loading: true,
                });
            }
        }

        const downloadLivePhotoBtn = document.getElementById(
            `download-btn-${item.id}`
        ) as HTMLButtonElement;
        const downloadFile = () => {
            downloadFileHelper(photoSwipe.currItem as unknown as EnteFile);
        };

        if (downloadLivePhotoBtn) {
            downloadLivePhotoBtn.addEventListener('click', downloadFile);
        }

        return () => {
            if (downloadLivePhotoBtn) {
                downloadLivePhotoBtn.removeEventListener('click', downloadFile);
            }
            setLivePhotoBtnOptions(defaultLivePhotoDefaultOptions);
        };
    }, [photoSwipe?.currItem, isOpen, isSourceLoaded]);

    useEffect(() => {
        exifCopy.current = exif;
    }, [exif]);

    function updateFavButton(file: EnteFile) {
        setIsFav(isInFav(file));
    }

    function updateIsOwnFile(file: EnteFile) {
        const isOwnFile =
            !publicCollectionGalleryContext.accessedThroughSharedURL &&
            galleryContext.user?.id === file.ownerID;
        setIsOwnFile(isOwnFile);
    }

    function updateExif(file: EnteFile) {
        if (file.metadata.fileType === FILE_TYPE.VIDEO) {
            setExif({ key: file.src, value: null });
            return;
        }
        if (!file.isSourceLoaded || file.conversionFailed) {
            return;
        }

        if (!file || !exifCopy?.current?.value === null) {
            return;
        }
        const key =
            file.metadata.fileType === FILE_TYPE.IMAGE
                ? file.src
                : (file.srcURLs.url as LoadedLivePhotoSourceURL).image;

        if (exifCopy?.current?.key === key) {
            return;
        }
        setExif({ key, value: undefined });
        checkExifAvailable(file);
    }

    function updateShowConvertBtn(file: EnteFile) {
        const shouldShowConvertBtn =
            isElectron() &&
            (file.metadata.fileType === FILE_TYPE.VIDEO ||
                file.metadata.fileType === FILE_TYPE.LIVE_PHOTO) &&
            !file.isConverted &&
            file.isSourceLoaded &&
            !file.conversionFailed;
        setShowConvertBtn(shouldShowConvertBtn);
    }

    function updateConversionFailedNotification(file: EnteFile) {
        setConversionFailedNotificationOpen(file.conversionFailed);
    }

    function updateIsSourceLoaded(file: EnteFile) {
        setIsSourceLoaded(file.isSourceLoaded);
    }

    function updateShowEditButton(file: EnteFile) {
        const extension = getFileExtension(file.metadata.title);
        const isSupported =
            !isRawFile(extension) || isSupportedRawFormat(extension);
        setShowEditButton(
            file.metadata.fileType === FILE_TYPE.IMAGE && isSupported
        );
    }

    function updateShowZoomButton(file: EnteFile) {
        setShowZoomButton(file.metadata.fileType === FILE_TYPE.IMAGE);
    }

    const openPhotoSwipe = () => {
        const { items, currentIndex } = props;
        const options = {
            history: false,
            maxSpreadZoom: 5,
            index: currentIndex,
            showHideOpacity: true,
            arrowKeys: false,
            getDoubleTapZoom(isMouseClick, item) {
                if (isMouseClick) {
                    return 2.5;
                }
                // zoom to original if initial zoom is less than 0.7x,
                // otherwise to 1.5x, to make sure that double-tap gesture always zooms image
                return item.initialZoomLevel < 0.7 ? 1 : 1.5;
            },
            getThumbBoundsFn: (index) => {
                try {
                    const file = items[index];
                    const ele = document.getElementById(`thumb-${file.id}`);
                    if (ele) {
                        const rect = ele.getBoundingClientRect();
                        const pageYScroll =
                            window.pageYOffset ||
                            document.documentElement.scrollTop;
                        return {
                            x: rect.left,
                            y: rect.top + pageYScroll,
                            w: rect.width,
                        };
                    }
                    return null;
                } catch (e) {
                    return null;
                }
            },
        };
        const photoSwipe = new Photoswipe(
            pswpElement.current,
            PhotoswipeUIDefault,
            items,
            options
        );
        photoSwipeV4Events.forEach((event) => {
            const callback = props[event];
            if (callback || event === 'destroy') {
                photoSwipe.listen(event, function (...args) {
                    if (callback) {
                        args.unshift(photoSwipe);
                        callback(...args);
                    }
                    if (event === 'destroy') {
                        handleClose();
                    }
                    if (event === 'close') {
                        handleClose();
                    }
                });
            }
        });
        photoSwipe.listen('beforeChange', () => {
            if (!photoSwipe?.currItem) return;
            const currItem = photoSwipe.currItem as EnteFile;
            const videoTags = document.getElementsByTagName('video');
            for (const videoTag of videoTags) {
                videoTag.pause();
            }
            updateFavButton(currItem);
            updateIsOwnFile(currItem);
            updateConversionFailedNotification(currItem);
            updateExif(currItem);
            updateShowConvertBtn(currItem);
            updateIsSourceLoaded(currItem);
            updateShowEditButton(currItem);
            updateShowZoomButton(currItem);
        });
        photoSwipe.listen('resize', () => {
            if (!photoSwipe?.currItem) return;
            const currItem = photoSwipe.currItem as EnteFile;
            updateExif(currItem);
            updateConversionFailedNotification(currItem);
            updateShowConvertBtn(currItem);
            updateIsSourceLoaded(currItem);
        });
        photoSwipe.init();
        needUpdate.current = false;
        setIsInFullScreenMode(false);
        setPhotoSwipe(photoSwipe);
    };

    const closePhotoSwipe = () => {
        if (photoSwipe) photoSwipe.close();
    };

    const handleClose = () => {
        const { onClose } = props;
        if (typeof onClose === 'function') {
            onClose(needUpdate.current);
        }
        const videoTags = document.getElementsByTagName('video');
        for (const videoTag of videoTags) {
            videoTag.pause();
        }
        handleCloseInfo();
    };
    const isInFav = (file: EnteFile) => {
        const { favItemIds } = props;
        if (favItemIds && file) {
            return favItemIds.has(file.id);
        }
        return false;
    };

    const onFavClick = async (file: EnteFile) => {
        try {
            if (
                !file ||
                props.isTrashCollection ||
                !isOwnFile ||
                props.isInHiddenSection
            ) {
                return;
            }
            const { favItemIds } = props;
            if (!isInFav(file)) {
                favItemIds.add(file.id);
                addToFavorites(file);
                setIsFav(true);
            } else {
                favItemIds.delete(file.id);
                removeFromFavorites(file);
                setIsFav(false);
            }
            needUpdate.current = true;
        } catch (e) {
            logError(e, 'onFavClick failed');
        }
    };

    const trashFile = async (file: EnteFile) => {
        const { tempDeletedFileIds, setTempDeletedFileIds } = props;
        try {
            appContext.startLoading();
            await trashFiles([file]);
            appContext.finishLoading();
            tempDeletedFileIds.add(file.id);
            setTempDeletedFileIds(new Set(tempDeletedFileIds));
            updateItems(props.items.filter((item) => item.id !== file.id));
            needUpdate.current = true;
        } catch (e) {
            logError(e, 'trashFile failed');
        }
    };

    const confirmTrashFile = (file: EnteFile) => {
        if (!file || !isOwnFile || props.isTrashCollection) {
            return;
        }
        appContext.setDialogMessage(getTrashFileMessage(() => trashFile(file)));
    };

    const handleArrowClick = (
        e: KeyboardEvent,
        direction: 'left' | 'right'
    ) => {
        // ignore arrow clicks if the user is typing in a text field
        if (
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement
        ) {
            return;
        }
        if (direction === 'left') {
            photoSwipe.prev();
        } else {
            photoSwipe.next();
        }
    };

    const updateItems = (items: EnteFile[]) => {
        try {
            if (photoSwipe) {
                if (items.length === 0) {
                    photoSwipe.close();
                }
                photoSwipe.items.length = 0;
                items.forEach((item) => {
                    photoSwipe.items.push(item);
                });

                photoSwipe.invalidateCurrItems();
                if (isOpen) {
                    photoSwipe.updateSize(true);
                    if (
                        photoSwipe.getCurrentIndex() >= photoSwipe.items.length
                    ) {
                        photoSwipe.goTo(0);
                    }
                }
            }
        } catch (e) {
            logError(e, 'updateItems failed');
        }
    };

    const refreshPhotoswipe = () => {
        try {
            photoSwipe.invalidateCurrItems();
            if (isOpen) {
                photoSwipe.updateSize(true);
            }
        } catch (e) {
            logError(e, 'refreshPhotoswipe failed');
        }
    };

    const checkExifAvailable = async (file: EnteFile) => {
        try {
            if (exifExtractionInProgress.current === file.src) {
                return;
            }
            try {
                exifExtractionInProgress.current = file.src;
                let fileObject: File;
                if (file.metadata.fileType === FILE_TYPE.IMAGE) {
                    fileObject = await getFileFromURL(
                        file.src as string,
                        file.metadata.title
                    );
                } else {
                    const url = (file.srcURLs.url as LoadedLivePhotoSourceURL)
                        .image;
                    fileObject = await getFileFromURL(url, file.metadata.title);
                }
                const fileTypeInfo = await getFileType(fileObject);
                const exifData = await getParsedExifData(
                    fileObject,
                    fileTypeInfo
                );
                if (exifExtractionInProgress.current === file.src) {
                    if (exifData) {
                        setExif({ key: file.src, value: exifData });
                    } else {
                        setExif({ key: file.src, value: null });
                    }
                }
            } finally {
                exifExtractionInProgress.current = null;
            }
        } catch (e) {
            setExif({ key: file.src, value: null });
            const fileExtension = getFileExtension(file.metadata.title);
            logError(e, 'checkExifAvailable failed', {
                extension: fileExtension,
            });
        }
    };

    const handleCloseInfo = () => {
        setShowInfo(false);
    };
    const handleOpenInfo = () => {
        setShowInfo(true);
    };

    const handleOpenEditor = () => {
        setShowImageEditorOverlay(true);
    };

    const handleCloseEditor = () => {
        setShowImageEditorOverlay(false);
    };

    const downloadFileHelper = async (file: EnteFile) => {
        if (
            file &&
            props.enableDownload &&
            props.setFilesDownloadProgressAttributesCreator
        ) {
            try {
                const setSingleFileDownloadProgress =
                    props.setFilesDownloadProgressAttributesCreator(
                        file.metadata.title
                    );
                await downloadSingleFile(file, setSingleFileDownloadProgress);
            } catch (e) {
                // do nothing
            }
        }
    };

    const copyToClipboardHelper = async (file: EnteFile) => {
        if (file && props.enableDownload && shouldShowCopyOption) {
            appContext.startLoading();
            await copyFileToClipboard(file.src);
            appContext.finishLoading();
        }
    };

    const toggleFullscreen = (photoSwipe) => {
        const fullScreenApi: PhotoswipeFullscreenAPI =
            photoSwipe?.ui?.getFullscreenAPI();
        if (!fullScreenApi) {
            return;
        }
        if (fullScreenApi.isFullscreen()) {
            fullScreenApi.exit();
            setIsInFullScreenMode(false);
        } else {
            fullScreenApi.enter();
            setIsInFullScreenMode(true);
        }
    };

    const toggleZoomInAndOut = () => {
        if (!photoSwipe) {
            return;
        }
        const initialZoomLevel = photoSwipe.currItem.initialZoomLevel;
        if (photoSwipe.getZoomLevel() !== initialZoomLevel) {
            photoSwipe.zoomTo(
                initialZoomLevel,
                {
                    x: photoSwipe.viewportSize.x / 2,
                    y: photoSwipe.viewportSize.y / 2,
                },
                333
            );
        } else {
            photoSwipe.zoomTo(
                photoSwipe.options.getDoubleTapZoom(true, photoSwipe.currItem),
                {
                    x: photoSwipe.viewportSize.x / 2,
                    y: photoSwipe.viewportSize.y / 2,
                },
                333
            );
        }
    };

    const triggerManualConvert = () => {
        props.getConvertedItem(
            photoSwipe,
            photoSwipe.getCurrentIndex(),
            photoSwipe.currItem as EnteFile
        );
    };

    const scheduleUpdate = () => (needUpdate.current = true);
    const { id } = props;
    let { className } = props;
    className = classnames(['pswp', className]).trim();
    return (
        <>
            <div
                id={id}
                className={className}
                tabIndex={Number('-1')}
                role="dialog"
                aria-hidden="true"
                ref={pswpElement}>
                <div className="pswp__bg" />
                <div className="pswp__scroll-wrap">
                    {livePhotoBtnOptions.visible && (
                        <LivePhotoBtnContainer>
                            <Button
                                color="secondary"
                                onClick={livePhotoBtnOptions.click}
                                onMouseEnter={livePhotoBtnOptions.show}
                                onMouseLeave={livePhotoBtnOptions.hide}
                                disabled={livePhotoBtnOptions.loading}>
                                <FlexWrapper gap={'4px'}>
                                    {<AlbumOutlined />} {t('LIVE')}
                                </FlexWrapper>
                            </Button>
                        </LivePhotoBtnContainer>
                    )}
                    <ConversionFailedNotification
                        open={conversionFailedNotificationOpen}
                        onClose={() =>
                            setConversionFailedNotificationOpen(false)
                        }
                        onClick={() =>
                            downloadFileHelper(photoSwipe.currItem as EnteFile)
                        }
                    />

                    <Box
                        sx={{
                            position: 'absolute',
                            top: '10vh',
                            right: '2vh',
                            zIndex: 10,
                        }}>
                        {fileDownloadProgress.has(
                            (photoSwipe?.currItem as EnteFile)?.id
                        ) ? (
                            <CircularProgressWithLabel
                                value={fileDownloadProgress.get(
                                    (photoSwipe.currItem as EnteFile)?.id
                                )}
                            />
                        ) : (
                            !isSourceLoaded && <EnteSpinner />
                        )}
                    </Box>

                    <div className="pswp__container">
                        <div className="pswp__item" />
                        <div className="pswp__item" />
                        <div className="pswp__item" />
                    </div>
                    <div className="pswp__ui pswp__ui--hidden">
                        <div className="pswp__top-bar">
                            <div className="pswp__counter" />

                            <button
                                className="pswp__button pswp__button--custom"
                                title={t('CLOSE_OPTION')}
                                onClick={handleClose}>
                                <CloseIcon />
                            </button>

                            {props.enableDownload && (
                                <button
                                    className="pswp__button pswp__button--custom"
                                    title={t('DOWNLOAD_OPTION')}
                                    onClick={() =>
                                        downloadFileHelper(
                                            photoSwipe.currItem as EnteFile
                                        )
                                    }>
                                    <DownloadIcon />
                                </button>
                            )}
                            {props.enableDownload && shouldShowCopyOption && (
                                <button
                                    className="pswp__button pswp__button--custom"
                                    title={t('COPY_OPTION')}
                                    onClick={() =>
                                        copyToClipboardHelper(
                                            photoSwipe.currItem as EnteFile
                                        )
                                    }>
                                    <ContentCopy fontSize="small" />
                                </button>
                            )}
                            {isOwnFile && !props.isTrashCollection && (
                                <button
                                    className="pswp__button pswp__button--custom"
                                    title={t('DELETE_OPTION')}
                                    onClick={() => {
                                        confirmTrashFile(
                                            photoSwipe?.currItem as EnteFile
                                        );
                                    }}>
                                    <DeleteIcon />
                                </button>
                            )}
                            {showZoomButton && (
                                <button
                                    className="pswp__button pswp__button--custom"
                                    onClick={toggleZoomInAndOut}
                                    title={t('ZOOM_IN_OUT')}>
                                    <ZoomInOutlinedIcon />
                                </button>
                            )}
                            <button
                                className="pswp__button pswp__button--custom"
                                onClick={() => {
                                    toggleFullscreen(photoSwipe);
                                }}
                                title={t('TOGGLE_FULLSCREEN')}>
                                {!isInFullScreenMode ? (
                                    <FullscreenOutlinedIcon
                                        sx={{ fontSize: 32 }}
                                    />
                                ) : (
                                    <FullscreenExitOutlinedIcon
                                        sx={{ fontSize: 32 }}
                                    />
                                )}
                            </button>

                            <button
                                className="pswp__button pswp__button--custom"
                                title={t('INFO_OPTION')}
                                onClick={handleOpenInfo}>
                                <InfoIcon />
                            </button>
                            {isOwnFile &&
                                !props.isTrashCollection &&
                                !props.isInHiddenSection && (
                                    <>
                                        {showEditButton && (
                                            <button
                                                className="pswp__button pswp__button--custom"
                                                onClick={handleOpenEditor}>
                                                <EditIcon />
                                            </button>
                                        )}
                                        <button
                                            title={
                                                isFav
                                                    ? t('UNFAVORITE_OPTION')
                                                    : t('FAVORITE_OPTION')
                                            }
                                            className="pswp__button pswp__button--custom"
                                            onClick={() => {
                                                onFavClick(
                                                    photoSwipe?.currItem as EnteFile
                                                );
                                            }}>
                                            {isFav ? (
                                                <FavoriteIcon />
                                            ) : (
                                                <FavoriteBorderIcon />
                                            )}
                                        </button>
                                    </>
                                )}
                            {showConvertBtn && (
                                <button
                                    title={t('CONVERT')}
                                    className="pswp__button pswp__button--custom"
                                    onClick={triggerManualConvert}>
                                    <ReplayIcon fontSize="small" />
                                </button>
                            )}
                            <div className="pswp__preloader" />
                        </div>
                        <button
                            className="pswp__button pswp__button--arrow--left"
                            title={t('PREVIOUS')}>
                            <ChevronLeft sx={{ pointerEvents: 'none' }} />
                        </button>
                        <button
                            className="pswp__button pswp__button--arrow--right"
                            title={t('NEXT')}>
                            <ChevronRight sx={{ pointerEvents: 'none' }} />
                        </button>
                        <div className="pswp__caption pswp-custom-caption-container">
                            <CaptionContainer />
                        </div>
                    </div>
                </div>
            </div>
            <FileInfo
                shouldDisableEdits={!isOwnFile}
                showCollectionChips={
                    !props.isTrashCollection &&
                    isOwnFile &&
                    !props.isInHiddenSection
                }
                showInfo={showInfo}
                handleCloseInfo={handleCloseInfo}
                file={photoSwipe?.currItem as EnteFile}
                exif={exif?.value}
                scheduleUpdate={scheduleUpdate}
                refreshPhotoswipe={refreshPhotoswipe}
                fileToCollectionsMap={props.fileToCollectionsMap}
                collectionNameMap={props.collectionNameMap}
                closePhotoViewer={handleClose}
            />
            <ImageEditorOverlay
                show={showImageEditorOverlay}
                file={photoSwipe?.currItem as EnteFile}
                onClose={handleCloseEditor}
                closePhotoViewer={handleClose}
            />
        </>
    );
}

export default PhotoViewer;
