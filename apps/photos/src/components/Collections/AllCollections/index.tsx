import React, { useContext } from 'react';
import Divider from '@mui/material/Divider';
import { COLLECTION_LIST_SORT_BY } from 'constants/collection';
import {
    Transition,
    AllCollectionDialog,
} from 'components/Collections/AllCollections/dialog';
import AllCollectionsHeader from './header';
import { CollectionSummary } from 'types/collection';
import AllCollectionContent from './content';
import { AppContext } from 'pages/_app';

interface Iprops {
    open: boolean;
    onClose: () => void;
    collectionSummaries: CollectionSummary[];
    setActiveCollectionID: (id?: number) => void;
    collectionListSortBy: COLLECTION_LIST_SORT_BY;
    setCollectionListSortBy: (v: COLLECTION_LIST_SORT_BY) => void;
    isInHiddenSection: boolean;
}

const LeftSlideTransition = Transition('up');

export default function AllCollections(props: Iprops) {
    const {
        collectionSummaries,
        open,
        onClose,
        setActiveCollectionID,
        collectionListSortBy,
        setCollectionListSortBy,
        isInHiddenSection,
    } = props;
    const { isMobile } = useContext(AppContext);

    const onCollectionClick = (collectionID: number) => {
        setActiveCollectionID(collectionID);
        onClose();
    };

    return (
        <AllCollectionDialog
            position="flex-end"
            TransitionComponent={LeftSlideTransition}
            onClose={onClose}
            open={open}
            fullScreen={isMobile}>
            <AllCollectionsHeader
                isInHiddenSection={isInHiddenSection}
                onClose={onClose}
                collectionCount={props.collectionSummaries.length}
                collectionSortBy={collectionListSortBy}
                setCollectionSortBy={setCollectionListSortBy}
            />
            <Divider />
            <AllCollectionContent
                collectionSummaries={collectionSummaries}
                onCollectionClick={onCollectionClick}
            />
        </AllCollectionDialog>
    );
}
