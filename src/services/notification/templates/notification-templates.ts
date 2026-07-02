export const notificationTemplates = {
  caseStatusUpdate(caseNumber: string, oldStatus: string, newStatus: string) {
    return {
      subject: `Case ${caseNumber} - Status Updated`,
      body: `The status of case ${caseNumber} has been changed from "${oldStatus}" to "${newStatus}".`,
    };
  },

  newAssignment(caseNumber: string, lawyerName: string) {
    return {
      subject: `New Case Assignment - ${caseNumber}`,
      body: `${lawyerName} has been assigned to case ${caseNumber}.`,
    };
  },

  taskDueReminder(taskTitle: string, dueDate: string, caseNumber: string) {
    return {
      subject: `Task Due Reminder - ${taskTitle}`,
      body: `The task "${taskTitle}" for case ${caseNumber} is due on ${dueDate}. Please ensure it is completed on time.`,
    };
  },

  eventReminder(eventTitle: string, startDate: string, location: string) {
    return {
      subject: `Event Reminder - ${eventTitle}`,
      body: `Reminder: "${eventTitle}" is scheduled for ${startDate} at ${location}.`,
    };
  },

  documentUploaded(docTitle: string, caseNumber: string, uploaderName: string) {
    return {
      subject: `New Document Uploaded - ${caseNumber}`,
      body: `${uploaderName} has uploaded a new document "${docTitle}" to case ${caseNumber}.`,
    };
  },
};
