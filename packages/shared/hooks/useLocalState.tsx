import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { getData, LS_KEYS, setData } from '@ente/shared/storage/localStorage';

export function useLocalState<T>(
    key: LS_KEYS,
    initialValue?: T
): [T, Dispatch<SetStateAction<T>>] {
    const [value, setValue] = useState<T>(initialValue);

    useEffect(() => {
        const { value } = getData(key) ?? {};
        if (typeof value !== 'undefined') {
            setValue(value);
        }
    }, []);

    useEffect(() => {
        if (typeof value !== 'undefined') {
            setData(key, { value });
        }
    }, [value]);

    return [value, setValue];
}
