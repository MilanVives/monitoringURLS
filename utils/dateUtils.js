function getTimeDifference(submissionTime) {
  try {
    const [datePart, timePart] = submissionTime.split(' ');
    const [day, month, year] = datePart.split('-');
    const [hours, minutes] = timePart.split(':');
    const subDate = new Date(year, month-1, day, hours, minutes);
    if (isNaN(subDate.getTime())) {
      throw new Error('Invalid date');
    }
    const now = new Date();
    const diffMs = now - subDate;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return { days: diffDays, hours: diffHours };
  } catch (error) {
    console.error(`Error parsing submission time "${submissionTime}":`, error);
    return { days: 0, hours: 0 };
  }
}

module.exports = { getTimeDifference }; 