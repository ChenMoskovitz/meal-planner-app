// --- 1. Helper Logic for Dates ---
export const getSundayOfCurrentWeek = (d) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day;
    return new Date(date.setDate(diff));
};

// toISOString() converts to UTC first, which rolls the date back a day for
// anyone east of Greenwich. Read the local calendar fields instead.
export const toLocalDateString = (d) => {
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
};

export const getWeekDaysFromSunday = (sunday) => {
    return [...Array(7)].map((_, i) => {
        const d = new Date(sunday);
        d.setDate(d.getDate() + i);
        return toLocalDateString(d);
    });
};
