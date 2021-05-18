sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/routing/History",
	"sap/m/GroupHeaderListItem",
	"sap/base/Log",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (Controller, History, GroupHeaderListItem, Log, Filter, FilterOperator) {
	"use strict";

	return Controller.extend("labour.timesheet.LabourTimesheet.controller.BaseController", {
		/**
		 * Convenience method for accessing the router in every controller of the application.
		 * @public
		 * @returns {sap.ui.core.routing.Router} the router for this component
		 */
		getRouter: function () {
			return this.getOwnerComponent().getRouter();
		},

		/**
		 * Convenience method for getting the view model by name in every controller of the application.
		 * @public
		 * @param {string} sName the model name
		 * @returns {sap.ui.model.Model} the model instance
		 */
		getModel: function (sName) {
			return this.getView().getModel(sName);
		},

		/**
		 * Convenience method for setting the view model in every controller of the application.
		 * @public
		 * @param {sap.ui.model.Model} oModel the model instance
		 * @param {string} sName the model name
		 * @returns {sap.ui.mvc.View} the view instance
		 */
		setModel: function (oModel, sName) {
			return this.getView().setModel(oModel, sName);
		},

		/**
		 * Convenience method for getting the resource bundle.
		 * @public
		 * @returns {sap.ui.model.resource.ResourceModel} the resourceModel of the component
		 */
		getResourceBundle: function () {
			return this.getOwnerComponent().getModel("i18n").getResourceBundle();
		},

		/**
		 * Event handler for navigating back.
		 * It there is a history entry or an previous app-to-app navigation we go one step back in the browser history
		 * If not, it will replace the current entry of the browser history with the master route.
		 * @public
		 */
		onNavBack: function () {
			var sPreviousHash = History.getInstance().getPreviousHash(),
				oCrossAppNavigator = sap.ushell.Container.getService("CrossApplicationNavigation");

			if (sPreviousHash !== undefined || !oCrossAppNavigator.isInitialNavigation()) {
				// eslint-disable-next-line sap-no-history-manipulation
				history.go(-1);
			} else {
				this.getRouter().navTo("master", {}, true);
			}
		},

		/////////////////////////////////////////// SET USER MODEL AND STORE LOGIN INFO ///////////////////////////////

		getUserInfo: function (sAppName, sRole, sProjectCode) {
			var oModel = this.getModel(),
				oUserModel = this.getModel("userModel"),
				oLogin = {};

			oUserModel.setProperty("/app", sAppName);
			oUserModel.setProperty("/role", sRole);
			oUserModel.setProperty("/projectCode", sProjectCode);
			oLogin.app = sAppName;
			oLogin.role = sRole;
			oLogin.projectCode = sProjectCode;
			oModel.create("/Logins", oLogin, {
				success: function (oData) {
					if (oData && oData.createdBy) {
						oUserModel.setProperty("/email", oData.createdBy);
					}
				}
			});
		},

		isWeekendDay: function (oDate) {
			var aWeekendDays = this.getModel("workTimeModel").getProperty("/weekendDays");
			if (aWeekendDays.includes(oDate.getDay())) {
				return true;
			} else {
				return false;
			}
		},

		isSpecialDate: function (oDate) {
			var aSpecialDates = this.getModel("workTimeModel").getProperty("/specialDates"),
				bIsSpecialDate = false;
			for (var i = 0; i < aSpecialDates.length; i++) {
				if (aSpecialDates[i].startDate.getFullYear() === oDate.getFullYear() && aSpecialDates[i].startDate.getMonth() === oDate.getMonth() &&
					aSpecialDates[i].startDate.getDate() === oDate.getDate()) {
					bIsSpecialDate = true;
					break;
				}
			}
			return bIsSpecialDate;
		},

		getDecimalHours: function (sHours, sMinutes) {
			return sHours + sMinutes / 60;
		},

		getShiftFromID: function (sShiftID) {
			var oWorkTimeModel = this.getModel("workTimeModel"),
				aShifts = oWorkTimeModel.getProperty("/shifts");
			return aShifts.find(function (oShift) {
				return oShift.ID === sShiftID;
			});
		},

		getShiftPartIndexFromDate: function (oDate, oShift) {
			var mDateHours = this.getDecimalHours(oDate.getHours(), oDate.getMinutes()),
				mShiftStartHours,
				mShiftEndHours,
				iShiftPartIndex;
			// Attention: end of shiftPart and start of next shiftPart have equal times
			// if oDate is at shiftPart start/end it finds the earlier shiftPart
			// shiftPartIndex might have to be corrected
			for (var i = 0; i < oShift.shiftParts.length; i++) {
				mShiftStartHours = this.getDecimalHours(oShift.shiftParts[i].startTimeHrs, oShift.shiftParts[i].startTimeMins);
				mShiftEndHours = this.getDecimalHours(oShift.shiftParts[i].endTimeHrs, oShift.shiftParts[i].endTimeMins);
				if (mDateHours >= mShiftStartHours && mDateHours <= mShiftEndHours) {
					iShiftPartIndex = i;
					break;
				}
			}
			return iShiftPartIndex;
		},

		getShiftEnd: function (oDate, oShift) { // returns end of current shift
			var oShiftEndDate = new Date(oDate.getTime()),
				oLastShiftPart = oShift.shiftParts[oShift.shiftParts.length - 1];
			oShiftEndDate.setHours(oLastShiftPart.endTimeHrs);
			oShiftEndDate.setMinutes(oLastShiftPart.endTimeMins, 0, 0);
			return oShiftEndDate;
		},

		getShiftStart: function (oDate, oShift) { // returns start of current shift
			var oShiftStartDate = new Date(oDate.getTime()),
				oFirstShiftPart = oShift.shiftParts[0];
			oShiftStartDate.setHours(oFirstShiftPart.startTimeHrs);
			oShiftStartDate.setMinutes(oFirstShiftPart.startTimeMins, 0, 0);
			return oShiftStartDate;
		},

		getRemainingDurationHoursOfShiftPart: function (oCurrentTime, oShiftPart) {
			var mStartHours = this.getDecimalHours(oCurrentTime.getHours(), oCurrentTime.getMinutes()),
				mEndHours = this.getDecimalHours(oShiftPart.endTimeHrs, oShiftPart.endTimeMins);

			if (mEndHours < mStartHours) { // shiftPart stretches over midnight
				mEndHours = mEndHours + 24;
			}
			return mEndHours - mStartHours;
		},

		getShiftPartsAndValuesOnADay: function (oTask, oDate) {
			// only for tasks that are at least started
			// only within one shift (day)
			// oTask may start and end before or after oDate
			var oShift = this.getShiftFromID(oTask.shift_ID),
				oCurrentTime,
				oStart,
				oEnd,
				iShiftPartIndex,
				oShiftPartValues,
				aShiftPartsWithValues = [],
				bComplete = false;

			// set the current/start time to shift start if task started (the day) before
			oCurrentTime = (this.getShiftStart(oDate, oShift).getTime() > oTask.actualStart.getTime()) ?
				new Date(this.getShiftStart(oDate, oShift).getTime()) : new Date(oTask.actualStart.getTime());
			oStart = new Date(oCurrentTime);
			// set end time to shift end if task ends after shift end
			oEnd = (this.getShiftEnd(oDate, oShift).getTime() < new Date(oTask.estimatedEnd).getTime()) ?
				new Date(this.getShiftEnd(oDate, oShift).getTime()) : new Date(oTask.estimatedEnd.getTime());
			iShiftPartIndex = this.getShiftPartIndexFromDate(oCurrentTime, oShift);
			while (!bComplete) {
				oShiftPartValues = this.getWorkingTimesInShiftPart(oStart, oEnd, oShift.shiftParts[iShiftPartIndex], oCurrentTime);
				if (oShiftPartValues) { // undefined if it is break time
					aShiftPartsWithValues.push(oShiftPartValues);
				}
				if (oShiftPartValues && oShiftPartValues.completed) {
					bComplete = true;
					break;
				}
				if (iShiftPartIndex === (oShift.shiftParts.length - 1)) { // last shiftPart of this shift
					bComplete = true; // attention: this is different to other BaseControllers - no shift to next shiftStart
					break;
				} else {
					iShiftPartIndex++;
					oCurrentTime.setHours(oShift.shiftParts[iShiftPartIndex].startTimeHrs);
					oCurrentTime.setMinutes(oShift.shiftParts[iShiftPartIndex].startTimeMins);
				}
			}
			return aShiftPartsWithValues;
		},

		getWorkingTimesInShiftPart: function (oStart, oEnd, oShiftPart, oCurrentTime) {
			var bLastShiftPart = (oCurrentTime.getTime() + this.getRemainingDurationHoursOfShiftPart(oCurrentTime, oShiftPart) * 60 * 60 * 1000) >=
				oEnd.getTime(),
				bFirstShiftPart = (oStart.getTime() === oCurrentTime.getTime()),
				oTimeInterval = {
					date: new Date(oCurrentTime),
					wageIncrease: oShiftPart.wageIncrease,
					timeTypeID: oShiftPart.timeTypeID,
					shiftPartID: oShiftPart.ID,
					startTimeHours: oShiftPart.startTimeHrs,
					startTimeMinutes: oShiftPart.startTimeMins,
					endTimeHours: oShiftPart.endTimeHrs,
					endTimeMinutes: oShiftPart.endTimeMins,
					completed: bLastShiftPart
				};

			if (oShiftPart.breakTime) {
				return undefined;
			}
			// correct times in case of first/last shiftPart
			if (bFirstShiftPart) { // start time is within shiftPart
				oTimeInterval.startTimeHours = oStart.getHours();
				oTimeInterval.startTimeMinutes = oStart.getMinutes();
			}
			if (bLastShiftPart) { // end time is within shiftPart
				oTimeInterval.endTimeHours = oEnd.getHours();
				oTimeInterval.endTimeMinutes = oEnd.getMinutes();
			}
			return oTimeInterval;
		},

		getShiftIDAndName: function (sShiftPartID) {
			var oWorkTimeModel = this.getModel("workTimeModel"),
				aShifts = oWorkTimeModel.getProperty("/shifts"),
				oReturn = {
					ID: "",
					shiftName: ""
				};

			for (var j = 0; j < aShifts.length; j++) { // array.find stopped after the first item
				for (var k = 0; k < aShifts[j].shiftParts.length; k++) {
					if (aShifts[j].shiftParts[k].ID === sShiftPartID) {
						oReturn.ID = aShifts[j].ID;
						oReturn.shiftName = aShifts[j].code;
						return oReturn;
					}
				}
			}
		},

		getEndOfLastShiftOnADay: function (aInboundShifts, oDate) {
			var aShifts = [],
				oEndDate = new Date(oDate.getTime());
			for (var i = 0; i < aInboundShifts.length; i++) {
				if (this.isWeekendDay(oDate) && !aShifts[i].ignoreWeekends) {
					continue;
				}
				if (this.isSpecialDate(oDate) && !aShifts[i].ignoreHolidays) {
					continue;
				}
				aShifts.push(aInboundShifts[i]);
			}
			if (aShifts.length === 0) {
				return undefined; // no shift on this oDate
			}
			if (aShifts.length === 1) {
				oEndDate.setHours(aShifts[0].shiftParts[aShifts[0].shiftParts.length - 1].endTimeHrs,
					aShifts[0].shiftParts[aShifts[0].shiftParts.length - 1].endTimeMins, 0, 0);
				return oEndDate;
			}
			// sort descending by end time of last shift part
			aShifts.sort(function (a, b) {
				return b.shiftParts[b.shiftParts.length - 1].endTimeHrs + b.shiftParts[b.shiftParts.length - 1].endTimeMins / 60 -
					a.shiftParts[a.shiftParts.length - 1].endTimeHrs + a.shiftParts[a.shiftParts.length - 1].endTimeMins / 60;
			});
			oEndDate.setHours(aShifts[0].shiftParts[aShifts[0].shiftParts.length - 1].endTimeHrs,
				aShifts[0].shiftParts[aShifts[0].shiftParts.length - 1].endTimeMins, 0, 0);
			return oEndDate;
		},

		getWorkingHoursOfShift: function (sShiftID) {
			var oShift = this.getShiftFromID(sShiftID),
				aShiftParts = oShift.shiftParts,
				mShiftTotalWorkingHours = 0;

			aShiftParts.forEach(function (oShiftPart) {
				if (!oShiftPart.breakTime) {
					mShiftTotalWorkingHours += (oShiftPart.endTimeHrs + oShiftPart.endTimeMins / 60) -
						(oShiftPart.startTimeHrs + oShiftPart.startTimeMins / 60);
				}
			});
			return parseFloat(mShiftTotalWorkingHours).toFixed(3);
		},

		getCostOfShift: function (oPerson, sShiftID) {
			// oPerson is the listItem
			var oShift = this.getShiftFromID(sShiftID),
				aShiftParts = oShift.shiftParts,
				mRate = oPerson.getBindingContext().getProperty("wageClass/rate"),
				mShiftDurationHrs,
				mShiftTotalCost = 0;

			aShiftParts.forEach(function (oShiftPart) {
				if (!oShiftPart.breakTime) {
					mShiftDurationHrs = (oShiftPart.endTimeHrs + oShiftPart.endTimeMins / 60) -
						(oShiftPart.startTimeHrs + oShiftPart.startTimeMins / 60);
					mShiftTotalCost += oShiftPart.wageIncrease ? mRate * (1 + oShiftPart.wageIncrease / 100) * mShiftDurationHrs :
						mRate * mShiftDurationHrs;
				}
			});
			return parseFloat(mShiftTotalCost).toFixed(3);
		},

		getHoursWorkedOfTimesheet: function (aTimesheetEntries) {
			var mHours = 0;
			aTimesheetEntries.forEach(function (oTimesheetEntry) {
				if (!(oTimesheetEntry instanceof GroupHeaderListItem)) {
					mHours += Number(oTimesheetEntry.getBindingContext().getProperty("hoursWorked"));
				}
			});
			return parseFloat(mHours).toFixed(3);
		},

		getCostWorkedOfTimesheet: function (aTimesheetEntries) {
			var mCost = 0;
			aTimesheetEntries.forEach(function (oTimesheetEntry) {
				if (!(oTimesheetEntry instanceof GroupHeaderListItem)) {
					mCost += Number(oTimesheetEntry.getBindingContext().getProperty("calculatedCost"));
				}
			});
			return parseFloat(mCost).toFixed(3);
		},

		_updateTimesheet: function (sTimesheetID, sShiftID, oPerson, mTotalHours, mTotalCost) {
			// called after timesheet entries were created; updates totals in timesheet
			var oModel = this.getModel(),
				sTimesheetPath = "/" + oModel.createKey("Timesheets", {
					ID: sTimesheetID
				}),
				oTimesheet = oModel.createBindingContext(sTimesheetPath).getObject({
					select: "*"
				});

			oTimesheet.hoursWorked = parseFloat(mTotalHours).toFixed(3);
			oTimesheet.hoursShift = this.getWorkingHoursOfShift(sShiftID);
			oTimesheet.costWorking = parseFloat(mTotalCost).toFixed(3);
			oTimesheet.costShift = this.getCostOfShift(oPerson, sShiftID);
			oModel.update(sTimesheetPath, oTimesheet, {
				error: function (oError) {
					Log.error("Error updating timesheet with time and cost totals");
				}
			});
		},

		_getTasksOfTimesheetEntries: function (aItems) {
			var oModel = this.getModel(),
				aTasks = [],
				sTaskID,
				sTaskPath,
				aLastTaskIDAdded = "";

			aItems.forEach(function (oItem) {
				if (!(oItem instanceof GroupHeaderListItem)) {
					sTaskID = oItem.getBindingContext().getProperty("task_ID");
					if (sTaskID && sTaskID !== aLastTaskIDAdded) {
						sTaskPath = "/" + oModel.createKey("Tasks", {
							ID: sTaskID
						});
						aTasks.push(oModel.createBindingContext(sTaskPath).getObject());
						aLastTaskIDAdded = sTaskID;
					}
				}
			});
			return aTasks;
		},

		_updateTasksWithActualLaborCost: function (aTasks) {
			var oModel = this.getModel();
			// updates tasks with actual values after timesheet(entries) was changed
			aTasks.reduce(function (oAgg, oTask, i) {
				new Promise(function (resolve, reject) {
					var oFilter = new Filter("task_ID", FilterOperator.EQ, oTask.ID);
					oModel.read("/TimeSheetEntries", {
						filters: [oFilter],
						success: function (oData) {
							if (oData && oData.results.length > 0) {
								var aTimesheetEntries = oData.results,
									sTaskPath = oModel.createKey("/Tasks", {
										ID: oTask.ID
									}),
									oTaskUpdate = {
										costLaborActual: 0.0,
										hoursLaborActual: 0.0
									};
								aTimesheetEntries.forEach(function (oTimesheetEntry) {
									oTaskUpdate.costLaborActual += Number(oTimesheetEntry.calculatedCost);
									oTaskUpdate.hoursLaborActual += Number(oTimesheetEntry.hoursWorked);
								});
								oTaskUpdate.costLaborActual = parseFloat(oTaskUpdate.costLaborActual).toFixed(3);
								oTaskUpdate.hoursLaborActual = parseFloat(oTaskUpdate.hoursLaborActual).toFixed(3);
								oModel.update(sTaskPath, oTaskUpdate, {
									error: function () {
										Log.error("Error updating task with actual labor values");
									}
								});
							}
						},
						error: function (oError) {
							Log.error("Error reading tasks to update them with actual labor cost");
						}
					});
				});
			}, Promise.resolve());
		},

		_loadShifts: function (sProjectID) {
			var oModel = this.getModel(),
				sProjectKey = oModel.createKey("Projects", {
					ID: sProjectID
				}),
				sShiftsKey = "/" + sProjectKey + "/shifts",
				sShiftPartsKey = "",
				sTimeTypeKey = "",
				getShifts = function (sPath) {
					var aShifts = [];
					return new Promise(function (resolve, reject) {
						oModel.read(sShiftsKey, {
							success: function (oShiftData) {
								for (var l = 0; l < oShiftData.results.length; l++) {
									aShifts.push({
										ID: oShiftData.results[l].ID,
										code: oShiftData.results[l].code,
										defaultShift: oShiftData.results[l].defaultShift,
										ignoreWeekends: oShiftData.results[l].ignoreWeekends,
										ignoreHolidays: oShiftData.results[l].ignoreHolidays,
										shiftParts: []
									});
								}
								resolve(aShifts);
							}
						});
					});
				},
				getShiftParts = function (aShifts) {
					return new Promise(function (resolve, reject) {
						aShifts.reduce(function (p, oShift, i, aShiftsArray) {
							new Promise(function () {
								sShiftPartsKey = "/" + oModel.createKey("Shifts", {
									ID: oShift.ID
								}) + "/shiftParts";
								oModel.read(sShiftPartsKey, {
									success: function (oShiftParts) {
										oShiftParts.results.reduce(function (q, oShiftPart, j) {
											new Promise(function () {
												sTimeTypeKey = "/" + oModel.createKey("TimeTypes", {
													ID: oShiftParts.results[j].timeType_ID
												});
												oModel.read(sTimeTypeKey, {
													success: function (oTimeType) {
														if (oTimeType) {
															aShifts[i].shiftParts.push({
																ID: oShiftParts.results[j].ID,
																startTimeHrs: oShiftParts.results[j].startTimeHrs,
																startTimeMins: oShiftParts.results[j].startTimeMins,
																endTimeHrs: oShiftParts.results[j].endTimeHrs,
																endTimeMins: oShiftParts.results[j].endTimeMins,
																timeTypeID: oShiftParts.results[j].timeType_ID,
																wageIncrease: oTimeType.wageIncrease,
																breakTime: oTimeType.breakTime
															});
															resolve(aShifts);
														}
													}
												});
											});
										}, Promise.resolve());
									}
								});
							});
						}, Promise.resolve(aShifts));
					});
				},
				getSpecialDays = function (sProjectPath) {
					var sSpecialDatesPath = "/" + sProjectPath + "/specialDates",
						aWeekendDays = [],
						aHolidays = [];
					return new Promise(function (resolve, reject) {
						oModel.read(sSpecialDatesPath, {
							success: function (oSpecialDatesData) {
								for (var i = 0; i < oSpecialDatesData.results.length; i++) {
									if (oSpecialDatesData.results[i].description === "Weekend Day") {
										aWeekendDays.push(oSpecialDatesData.results[i].specialDate.getMonth());
									} else {
										aHolidays.push({
											startDate: new Date(oSpecialDatesData.results[i].specialDate),
											description: oSpecialDatesData.results[i].description,
											type: "NonWorking"
										});
									}
								}
								resolve([aWeekendDays, aHolidays]);
							}
						});
					});
				},
				sortShifts = function (oShifts) {
					return new Promise(function (resolve) {
						for (var i = 0; i < oShifts.length; i++) {
							// revisit: next day flag must be interpreted (add 24h)
							oShifts[i].shiftParts.sort(function (a, b) {
								return (a.startTimeHrs + a.startTimeMins / 60) - (b.startTimeHrs + b.startTimeMins / 60);
							});
						}
						resolve(oShifts);
					});
				},
				oWorkingTimes = {
					shifts: [],
					weekendDays: [],
					specialDates: []
				},
				oWorkTimeModel = this.getModel("workTimeModel");

			// error handling in detail controller
			return new Promise(function (resolve, reject) {
				getShifts(sShiftsKey)
					.then(function (aShifts) {
						return getShiftParts(aShifts);
					}).then(function (aFinalShifts) {
						return sortShifts(aFinalShifts);
					}).then(function (oShifts) {
						oWorkingTimes.shifts = oShifts;
						return getSpecialDays(sProjectKey);
					}).then(function (aSpecialDays) {
						oWorkingTimes.weekendDays = aSpecialDays[0];
						oWorkingTimes.specialDates = aSpecialDays[1];
						oWorkTimeModel.setData(oWorkingTimes);
						resolve(oWorkingTimes);
					});
			});
		}

	});

});