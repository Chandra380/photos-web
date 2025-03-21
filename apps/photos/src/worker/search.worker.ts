import * as Comlink from 'comlink';
import {
    isInsideLocationTag,
    isInsideCity,
} from 'services/locationSearchService';
import { EnteFile } from 'types/file';
import { isSameDayAnyYear } from 'utils/search';
import { Search } from 'types/search';

export class DedicatedSearchWorker {
    private files: EnteFile[] = [];

    setFiles(files: EnteFile[]) {
        this.files = files;
    }

    search(search: Search) {
        return this.files.filter((file) => {
            return isSearchedFile(file, search);
        });
    }
}

Comlink.expose(DedicatedSearchWorker, self);

function isSearchedFile(file: EnteFile, search: Search) {
    if (search?.collection) {
        return search.collection === file.collectionID;
    }

    if (search?.date) {
        return isSameDayAnyYear(search.date)(
            new Date(file.metadata.creationTime / 1000)
        );
    }
    if (search?.location) {
        return isInsideLocationTag(
            {
                latitude: file.metadata.latitude,
                longitude: file.metadata.longitude,
            },
            search.location
        );
    }
    if (search?.city) {
        return isInsideCity(
            {
                latitude: file.metadata.latitude,
                longitude: file.metadata.longitude,
            },
            search.city
        );
    }
    if (search?.files) {
        return search.files.indexOf(file.id) !== -1;
    }
    if (search?.person) {
        return search.person.files.indexOf(file.id) !== -1;
    }

    if (search?.thing) {
        return search.thing.files.indexOf(file.id) !== -1;
    }

    if (search?.text) {
        return search.text.files.indexOf(file.id) !== -1;
    }
    if (typeof search?.fileType !== 'undefined') {
        return search.fileType === file.metadata.fileType;
    }
    if (typeof search?.clip !== 'undefined') {
        return search.clip.has(file.id);
    }
    return false;
}
