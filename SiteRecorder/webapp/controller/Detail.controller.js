sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/Dialog",
	"sap/m/Button",
	"sap/m/MessageBox",
	"sap/ui/core/format/DateFormat",
	"../model/formatter",
	"sap/m/library",
	"sap/base/Log"
], function (BaseController, JSONModel, Dialog, Button, MessageBox, DateFormat, formatter, mobileLibrary, Log) {
	"use strict";

	// shortcut for sap.m.URLHelper
	var URLHelper = mobileLibrary.URLHelper;

	return BaseController.extend("site.recorder.SiteRecorder.controller.Detail", {

		formatter: formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		onInit: function () {
			// Model used to manipulate control states. The chosen values make sure,
			// detail page is busy indication immediately so there is no break in
			// between the busy indication for loading the view's meta data
			var oViewModel = new JSONModel({
				busy: true,
				delay: 0,
				mode: "",
				shareSendEmailSubject: "",
				shareSendEmailMessage: "",
				taskID: "",
				TaskPath: "",
				UoM: "",
				countMeasurements: 0,
				countWorkers: 0,
				sMeasurementPath: "",
				sMeasurementID: "",
				selectedMeasurement: "",
				measurementItemListTitle: "",
				measurementListDelay: 0,
				currentQuantity: "",
				currentDuration: "",
				previousQuantity: "",
				previousDuration: "",
				nextQuantity: "",
				nextDuration: "",
				cumulativeQuantity: "",
				countProblemCards: 0,
				problemItemListTitle: "",
				problemID: "",
				countQualityCards: 0,
				qualityItemListTitle: "",
				qualityID: "",
				countHnSCards: 0,
				HnSItemListTitle: "",
				HnSID: ""

			});
			this.getRouter().getRoute("object").attachPatternMatched(this._onObjectMatched, this);

			this.setModel(oViewModel, "detailView");

			this.getOwnerComponent().getModel().metadataLoaded().then(this._onMetadataLoaded.bind(this));
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		/**
		 * Event handler when the share by E-Mail button has been clicked
		 * @public
		 */
		onSendEmailPress: function () {
			var oViewModel = this.getModel("detailView");

			URLHelper.triggerEmail(
				null,
				oViewModel.getProperty("/shareSendEmailSubject"),
				oViewModel.getProperty("/shareSendEmailMessage")
			);
		},

		/**
		 * Event handler when the share in JAM button has been clicked
		 * @public
		 */
		onShareInJamPress: function () {
			var oViewModel = this.getModel("detailView"),
				oShareDialog = sap.ui.getCore().createComponent({
					name: "sap.collaboration.components.fiori.sharing.dialog",
					settings: {
						object: {
							id: location.href,
							share: oViewModel.getProperty("/shareOnJamTitle")
						}
					}
				});

			oShareDialog.open();
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		/**
		 * Binds the view to the object path and expands the aggregated line items.
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		_onObjectMatched: function (oEvent) {
			var sObjectId = oEvent.getParameter("arguments").objectId;

			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			this.getModel().metadataLoaded().then(function () {
				var sObjectPath = "/" + this.getModel().createKey("Tasks", {
					ID: sObjectId
				});
				this._bindView(sObjectPath);
				this.getModel("detailView").setProperty("/taskID", sObjectId);
				this.getModel("detailView").setProperty("/taskPath", sObjectPath);
			}.bind(this));
		},

		/**
		 * Binds the view to the object path. Makes sure that detail view displays
		 * a busy indicator while data for the corresponding element binding is loaded.
		 * @function
		 * @param {string} sObjectPath path to the object to be bound to the view.
		 * @private
		 */
		_bindView: function (sObjectPath) {
			// Set busy indicator during view binding
			var oViewModel = this.getModel("detailView");

			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);

			this.getView().bindElement({
				path: sObjectPath,
				events: {
					change: this._onBindingChange.bind(this),
					dataRequested: function () {
						oViewModel.setProperty("/busy", true);
					},
					dataReceived: function () {
						oViewModel.setProperty("/busy", false);
					}
				}
			});
		},

		_onBindingChange: function () {
			var oView = this.getView(),
				oElementBinding = oView.getElementBinding();

			// No data for the binding
			if (!oElementBinding.getBoundContext()) {
				this.getRouter().getTargets().display("detailObjectNotFound");
				// if object could not be found, the selection in the master list
				// does not make sense anymore.
				this.getOwnerComponent().oListSelector.clearMasterListSelection();
				return;
			}

			var sPath = oElementBinding.getPath(),
				oResourceBundle = this.getResourceBundle(),
				oObject = oView.getModel().getObject(sPath),
				sObjectId = oObject.ID,
				sObjectName = oObject.shortText,
				oViewModel = this.getModel("detailView"),
				oNow = new Date(),
				oShift,
				oEstimatedEnd = this.byId("estimatedEnd"),
				oDateFormat = DateFormat.getDateTimeInstance({
					format: "yMdhm"
				});

			this.getOwnerComponent().oListSelector.selectAListItem(sPath);

			oViewModel.setProperty("/taskID", sObjectId);
			oViewModel.setProperty("/taskPath", sPath);
			oViewModel.setProperty("/saveAsTileTitle", oResourceBundle.getText("shareSaveTileAppTitle", [sObjectName]));
			oViewModel.setProperty("/shareOnJamTitle", sObjectName);
			oViewModel.setProperty("/shareSendEmailSubject",
				oResourceBundle.getText("shareSendEmailObjectSubject", [sObjectId]));
			oViewModel.setProperty("/shareSendEmailMessage",
				oResourceBundle.getText("shareSendEmailObjectMessage", [sObjectName, sObjectId, location.href]));

			if (oObject.status > 1) {
				if (oObject.actualStart > oNow) {
					// task started in the future; disable add measurement button
					this.byId("addMeasurementButton").setEnabled(false);
				} else {
					this.byId("addMeasurementButton").setEnabled(true);
				}
			} else {
				this.byId("addMeasurementButton").setEnabled(false);
			}
			if (oObject.status === 3) {
				// task is stopped - calculate stop duration until now,
				// calculate new estimated end and display both (db change only when status is changed)
				oShift = this.getShiftFromID(oObject.shift_ID);

				// estimatedEnd is calculated with remaining quantity
				oObject.estimatedEnd = this.getEndDateInWorkingHours(oNow, this.getRemainingQuantityAtStopTime(oObject), oObject.currentProductivity,
					oShift);
				oEstimatedEnd.setText(oDateFormat.format(oObject.estimatedEnd, false));
			}
		},

		_onMetadataLoaded: function () {
			// Store original busy indicator delay for the detail view
			var iOriginalViewBusyDelay = this.getView().getBusyIndicatorDelay(),
				oViewModel = this.getModel("detailView"),
				oMeasurementList = this.byId("measurementList"),
				iOriginalLineItemTableBusyDelay = oMeasurementList.getBusyIndicatorDelay();

			// Make sure busy indicator is displayed immediately when
			// detail view is displayed for the first time
			oViewModel.setProperty("/delay", 0);
			oViewModel.setProperty("/measurementListDelay", 0);

			oMeasurementList.attachEventOnce("updateFinished", function () {
				// Restore original busy indicator delay for line item table
				oViewModel.setProperty("/measurementListDelay", iOriginalLineItemTableBusyDelay);
			});

			// Binding the view will set it to not busy - so the view is always busy if it is not bound
			oViewModel.setProperty("/busy", true);
			// Restore original busy indicator delay for the detail view
			oViewModel.setProperty("/delay", iOriginalViewBusyDelay);
		},

		//////////////////////////// Status ////////////////////////////

		onStatusPressed: function () {
			var oModel = this.getModel(),
				sPath = this.getModel("detailView").getProperty("/taskPath"),
				oTask = oModel.getObject(sPath, {
					select: "*"
				}),
				oBC = this.getView().getBindingContext(),
				oShift = this.getShiftFromID(oBC.getProperty("shift_ID")),
				bAbort,
				sAlertMsg,
				that = this;

			if (oTask.status === 0) { // planned --> set committed
				oModel.setProperty("status", 1, oBC);
			} else if (oTask.status === 1) { // committed --> set started
				this.getPreviousTask(oTask).then(function (oPreviousTask) {
					if (oPreviousTask && oPreviousTask.status < 4) {
						sAlertMsg = that.getResourceBundle().getText("previousTaskNotCompleted", [oPreviousTask.taskName + " (" + oPreviousTask.number +
							")"
						]);
						bAbort = true;
						sap.m.MessageBox.alert(sAlertMsg);
					}
					if (bAbort) return;
					oModel.setProperty("status", 2, oBC);
					oTask.actualStart = that.getStartDateInWorkingHours(new Date(), oShift);
					oModel.setProperty("actualStart", oTask.actualStart, oBC);
					oModel.setProperty("estimatedEnd", that.getEndDateInWorkingHours(oTask.actualStart, oTask.quantity, oTask.plannedProductivity *
						oTask.productivityFactor, oShift), oBC);
					that.onCloseDetailPress(); // in most cases the task will not be filtered and most likely the user won't edit more data
					oModel.submitChanges({
						error: function () {
							Log.error("Error: Task status change could not be processed");
						}
					});
					//return; // otherwise the code after else would be executed before the then code
				});
			} else if (oTask.status === 2 || oTask.status === 3) { // set completed
				// checkAutoCompleteMeasurements creates final measurement, saves results to recipe and updates oTask
				// measurement dateTime will be adjusted to last shiftEnd if required
				oTask.status = 4; // set to completed
				oTask.estimatedEnd = new Date();
				if (!this.inShift(oTask.estimatedEnd, oShift)) {
					oTask.estimatedEnd = this.getPreviousShiftEnd(oTask.estimatedEnd, oShift);
				}
				this.checkAutoCompleteMeasurements(oTask); // saves oTask
				//this.createWorkerTimeSheets(oTask); now in timesheet app
				this.onCloseDetailPress();
				return;
			} else { // set approved
				oModel.setProperty("status", 5, oBC);

				this.onCloseDetailPress(); // in most cases the task will not be filtered and most likely the user won't edit more data
				oModel.submitChanges({
					error: function () {
						Log.error("Error: Task status change could not be processed");
					}
				});
			}
		},

		onStartStopPressed: function () {
			var oModel = this.getModel(),
				oViewModel = this.getModel("detailView"),
				sPath = oViewModel.getProperty("/taskPath"),
				oTask = oModel.getObject(sPath, {
					select: "*"
				}),
				oBC = this.getView().getBindingContext(),
				oShift = this.getShiftFromID(oBC.getProperty("shift_ID")),
				oNow = new Date();
			// start date was already set by Status button press
			if (oTask.status === 2) { // task is being stopped
				// if oNow is not in shift, set oTask.stoppedAt to the last shift end
				if (!this.inShift(oNow, oShift)) {
					oTask.stoppedAt = this.getShiftEnd(oNow, oShift);
				} else {
					oTask.stoppedAt = oNow;
				}
				oTask.status = 3; // set to stopped
				oModel.update(sPath, oTask);
				this.onAddProblem(); // allow adding a problem card for stopping the task
			} else if (oTask.status === 3) { // task is being re-started
				// if oNow is not in the shift, getNetDurationHoursFromDates calculates stop duration until last shift end
				var sStopDurationHours = this.getNetDurationHoursFromDates(oTask.stoppedAt, oNow, oShift),
					iStopDurationMs = parseInt(sStopDurationHours * 3600000, 10);
				if (!oTask.stopDuration || oTask.stopDuration === undefined) {
					oTask.stopDuration = iStopDurationMs;
				} else {
					oTask.stopDuration += iStopDurationMs;
				}
				oTask.status = 2;
				oTask.estimatedEnd = this.getEndDateInWorkingHours(oNow, this.getRemainingQuantityAtStopTime(oTask), oTask.currentProductivity,
					oShift);
				oModel.update(sPath, oTask);
			}
		},

		onRefresh: function () {
			this.getView().getElementBinding().refresh(true);
		},

		getRemainingQuantityAtStopTime: function (oTask) {
			// remaining quantity is calculated from the working hours between stop and estimated end 
			var sTotalQuantity = this.getView().getBindingContext().getProperty("quantity"),
				oShift = this.getShiftFromID(oTask.shift_ID),
				mWorkingHoursUntilEnd = this.getNetDurationHoursFromDates(oTask.stoppedAt, oTask.estimatedEnd, oShift);

			return mWorkingHoursUntilEnd * oTask.currentProductivity;
		},

		//////////////////////////////////// Measurement Dialog /////////////////////////////////

		onMeasurementListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("measurementList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("detailView");

			// only update the counter if the length is final
			if (oList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("detailLineItemTableHeadingCount", [iTotalItems]);
					var aItems = oList.getItems(),
						sCumulativeQuantity = aItems[aItems.length - 1].getBindingContext().getObject().measurementQuantity;
					oViewModel.setProperty("/cumulativeQuantity", sCumulativeQuantity);
					oViewModel.setProperty("/countMeasurements", iTotalItems);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("detailLineItemTableHeading");
					oViewModel.setProperty("/cumulativeQuantity", "");
					oViewModel.setProperty("/countMeasurements", "0");
				}
				oViewModel.setProperty("/measurementItemListTitle", sTitle);
				this.getView().rerender();
			}
		},

		onAddMeasurement: function () {
			var oFrag = sap.ui.core.Fragment,
				oDate,
				oNow = new Date(),
				oQuantity,
				oPoC,
				oDuration,
				aButtons,
				oList = this.getView().byId("measurementList"),
				aItems = oList.getItems(),
				oObject,
				sQuantity = "",
				sDuration = "",
				sOldQuantity = "",
				sOldDuration = "",
				oViewModel = this.getModel("detailView"),
				sTitle = this.getResourceBundle().getText("measurementDialogCreateTitle");

			if (aItems.length > 0) { // get cumulative values from last array item (list is sorted by date)
				oObject = aItems[aItems.length - 1].getBindingContext().getObject();
				sQuantity = oObject.measurementQuantity;
				sDuration = oObject.netDuration;
				sOldQuantity = sQuantity;
				sOldDuration = sDuration;
			}
			// set duration as net duration since start, deduct stop times
			var oModel = this.getModel(),
				sTaskID = this.getModel("detailView").getProperty("/taskID"),
				sTaskPath = "/" + oModel.createKey("Tasks", {
					ID: sTaskID
				}),
				oTask = oModel.getObject(sTaskPath, {
					select: "*"
				}),
				oShift = this.getShiftFromID(oTask.shift_ID),
				fPoC = Number(sQuantity) / oTask.quantity * 100;
			// if oNow is not in the shift, set it to last shift end
			if (!this.inShift(oNow, oShift)) {
				oNow = this.getShiftEnd(oNow, oShift);
			}
			sDuration = this.getNetDurationHoursFromDates(oTask.actualStart, oNow, oShift);
			sDuration -= oTask.stopDuration / 3600000; // oTask.stopDuration is in ms
			sDuration = parseFloat(sDuration).toFixed(3);
			oViewModel.setProperty("/currentQuantity", sQuantity);
			oViewModel.setProperty("/nextQuantity", "");
			oViewModel.setProperty("/previousQuantity", sQuantity);
			oViewModel.setProperty("/currentDuration", sDuration);
			oViewModel.setProperty("/nextDuration", "");
			oViewModel.setProperty("/previousDuration", sDuration);
			oViewModel.setProperty("/mode", "Create");
			// addMeasurement Button is only enabled if task.status=2 (started)
			this._createMeasurementDialog(true);

			oDate = oFrag.byId("myFrag", "date");
			oQuantity = oFrag.byId("myFrag", "quantity");
			oPoC = oFrag.byId("myFrag", "PoCSlider");
			oDuration = oFrag.byId("myFrag", "duration");
			sDuration = formatter.hoursToHoursMinutes(sDuration);
			aButtons = this.oNewMeasurementDialog.getButtons();
			oDate.setDateValue(oNow);
			oQuantity.setValue(sQuantity);
			oPoC.setValue(fPoC);
			oDuration.setValue(sDuration);
			oQuantity.setValueState("None");
			oDuration.setValueState("None");

			for (var i = 0; i < aButtons.length; i++) {
				aButtons[i].setVisible(false);
			}
			if (!sDuration || sDuration === "00:00") {
				return;
			}
			this._validateEditMeasurement(Number(sQuantity), Number(sDuration));
			this.updateButtonEnabledState(sQuantity, sDuration, sOldQuantity, sOldDuration, aButtons, true);
			this.oNewMeasurementDialog.setTitle(sTitle);
			this.oNewMeasurementDialog.open();
		},

		onPressMeasurement: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				oDate,
				oQuantity,
				oPoC,
				oDuration,
				aButtons,
				oList = this.getView().byId("measurementList"),
				aItems = oList.getItems(),
				oViewModel = this.getModel("detailView"),
				oMeasurementBC = oEvent.getSource().getBindingContext(),
				sMeasurementID = oMeasurementBC.getProperty("ID"),
				sQuantity = oMeasurementBC.getProperty("measurementQuantity"),
				oModel = this.getModel(),
				sTaskID = this.getModel("detailView").getProperty("/taskID"),
				sTaskPath = "/" + oModel.createKey("Tasks", {
					ID: sTaskID
				}),
				oTask = oModel.getObject(sTaskPath, {
					select: "*"
				}),
				fPoC = Number(sQuantity) / oTask.quantity * 100,
				sDuration = oMeasurementBC.getProperty("netDuration"),
				sOldQuantity = sQuantity,
				sOldDuration = sDuration,
				sDate = oMeasurementBC.getProperty("measurementDateTime"),
				sTitle = this.getResourceBundle().getText("measurementDialogEditTitle"),
				sMeasurementPath = "/" + oModel.createKey("Measurements", {
					ID: sMeasurementID
				});
			// update the viewModel
			oViewModel.setProperty("/sMeasurementPath", sMeasurementPath);
			oViewModel.setProperty("/sMeasurementID", sMeasurementID);
			oViewModel.setProperty("/mode", "Edit");
			this.setMeasurementSurroundingValues(aItems);

			// use same fragment for editing/creating
			this._createMeasurementDialog(false);

			oDate = oFrag.byId("myFrag", "date");
			oQuantity = oFrag.byId("myFrag", "quantity");
			oPoC = oFrag.byId("myFrag", "PoCSlider");
			oDuration = oFrag.byId("myFrag", "duration");
			aButtons = this.oNewMeasurementDialog.getButtons();
			oDate.setDateValue(sDate);
			oQuantity.setValue(sQuantity);
			oPoC.setValue(fPoC);
			sDuration = formatter.hoursToHoursMinutes(sDuration);
			oDuration.setValue(sDuration);
			oQuantity.setValueState("None");
			oDuration.setValueState("None");

			for (var i = 0; i < aButtons.length; i++) {
				aButtons[i].setVisible(false);
			}
			this._validateEditMeasurement(Number(sQuantity), Number(sDuration));
			this.updateButtonEnabledState(sQuantity, sDuration, sOldQuantity, sOldDuration, aButtons, false);
			this.oNewMeasurementDialog.setTitle(sTitle);
			this.oNewMeasurementDialog.open();
		},

		handleQuantityChange: function () {
			var oFrag = sap.ui.core.Fragment,
				oQuantity = oFrag.byId("myFrag", "quantity"),
				oPoC = oFrag.byId("myFrag", "PoCSlider"),
				oDuration = oFrag.byId("myFrag", "duration"),
				sQuantity = oQuantity.getValue(),
				fPoC = oPoC.getValue(),
				sDuration = oDuration.getValue(),
				aButtons = this.oNewMeasurementDialog.getButtons(),
				bCreate = this.getModel("detailView").getProperty("/mode") === "Create",
				sOldQuantity = this.getModel("detailView").getProperty("/currentQuantity"),
				sOldDuration = this.getModel("detailView").getProperty("/currentDuration"),
				sTaskID = this.getModel("detailView").getProperty("/taskID"),
				oModel = this.getModel(),
				sTaskPath = "/" + oModel.createKey("Tasks", {
					ID: sTaskID
				}),
				oTask = oModel.getObject(sTaskPath, {
					select: "*"
				});

			if (sQuantity !== sOldQuantity) {
				fPoC = Number(sQuantity) / oTask.quantity * 100;
				oPoC.setValue(fPoC);
			} else {
				sQuantity = parseFloat(oTask.quantity * fPoC / 100).toFixed(3);
				oQuantity.setValue(sQuantity);
			}

			this._validateEditMeasurement(Number(sQuantity), Number(sDuration));
			this.updateButtonEnabledState(sQuantity, sDuration, sOldQuantity, sOldDuration, aButtons, bCreate);
		},

		handleSliderChange: function () {
			var oFrag = sap.ui.core.Fragment,
				oQuantity = oFrag.byId("myFrag", "quantity"),
				oPoC = oFrag.byId("myFrag", "PoCSlider"),
				sQuantity = oQuantity.getValue(),
				fPoC = oPoC.getValue(),
				sTaskID = this.getModel("detailView").getProperty("/taskID"),
				oModel = this.getModel(),
				sTaskPath = "/" + oModel.createKey("Tasks", {
					ID: sTaskID
				}),
				oTask = oModel.getObject(sTaskPath, {
					select: "quantity"
				});

			sQuantity = parseFloat(oTask.quantity * fPoC / 100).toFixed(3);
			oQuantity.setValue(sQuantity);
			this.handleQuantityChange();
		},

		_createMeasurementDialog: function (bCreate) {
			var oFrag = sap.ui.core.Fragment,
				that = this,
				sQuantity,
				sDuration,
				oDate,
				oModel = this.getModel(),
				oViewModel = this.getView().getModel("detailView"),
				sTaskID = oViewModel.getProperty("/taskID"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sObjectPath,
				oMeasurement,
				sCreate = this.getResourceBundle().getText("measurementDialogCreateButtonText"),
				sCancel = this.getResourceBundle().getText("measurementDialogCancelButtonText"),
				sDelete = this.getResourceBundle().getText("measurementDialogDeleteButtonText"),
				sSave = this.getResourceBundle().getText("measurementDialogSaveButtonText"),
				sConfirmText = this.getResourceBundle().getText("measurementDialogConfirmDeleteText"),
				sConfirmTitle = this.getResourceBundle().getText("measurementDialogConfirmDeleteTitle");

			if (!that.oNewMeasurementDialog) {

				that.oNewMeasurementDialog = new Dialog({
					draggable: true,
					title: "",
					content: [
						sap.ui.xmlfragment("myFrag", "site.recorder.SiteRecorder.view.CreateMeasurement", this)
					],
					buttons: [{
						text: sCreate,
						enabled: false,
						visible: bCreate,
						press: function () {
							oDate = new Date();
							sTaskID = oViewModel.getProperty("/taskID");
							sQuantity = oFrag.byId("myFrag", "quantity").getValue();
							sDuration = oFrag.byId("myFrag", "duration").getValue();
							sDuration = formatter.hoursMinutesToDecimalHours(sDuration);
							oModel.createEntry("/Measurements", {
								properties: {
									project_ID: sProjectID,
									task_ID: sTaskID,
									measurementDateTime: oDate,
									measurementQuantity: sQuantity,
									netDuration: sDuration
								}
							});
							oModel.submitChanges();
							that._updateTaskAfterNewMeasurement(sTaskID, sQuantity, sDuration);
							that.oNewMeasurementDialog.close();
						}
					}, {
						text: sSave,
						enabled: false,
						visible: !bCreate,
						press: function () {
							sQuantity = oFrag.byId("myFrag", "quantity").getValue();
							sDuration = oFrag.byId("myFrag", "duration").getValue();
							sDuration = formatter.hoursMinutesToDecimalHours(sDuration);

							sObjectPath = that.getModel("detailView").getProperty("/sMeasurementPath");
							oMeasurement = oModel.getObject(sObjectPath, {
								select: "*"
							});
							oMeasurement.measurementQuantity = sQuantity;
							oMeasurement.netDuration = sDuration;
							oModel.update(sObjectPath, oMeasurement);

							// update performance values if the last measurement was edited
							var oList = that.getView().byId("measurementList"),
								aItems = oList.getItems(),
								sLastMeasurementID;
							if (aItems.length > 0) {
								sLastMeasurementID = aItems[aItems.length - 1].getBindingContext().getObject().ID;
								if (sLastMeasurementID === oMeasurement.ID) {
									that._updateTaskAfterNewMeasurement(sTaskID, sQuantity, sDuration);
								}
							}
							that.oNewMeasurementDialog.close();
						}
					}, {
						text: sDelete,
						enabled: false,
						visible: !bCreate,
						press: function () {
							oModel = that.getModel();
							sObjectPath = that.getModel("detailView").getProperty("/sMeasurementPath");
							MessageBox.confirm(
								sConfirmText, {
									icon: MessageBox.Icon.WARNING,
									title: sConfirmTitle,
									actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
									initialFocus: MessageBox.Action.CANCEL,
									onClose: function (sAction) {
										if (sAction === "OK") {
											// save quantity, duration of previous measurement if last measurement was deleted
											// aItems will change shortly after remove
											var aItems = that.byId("measurementList").getItems(),
												bLastMeasurement = sObjectPath === aItems[aItems.length - 1].getBindingContext().getPath();
											if (bLastMeasurement) {
												if (aItems.length > 1) { // there is a previous measurement
													sQuantity = aItems[aItems.length - 2].getBindingContext().getProperty("measurementQuantity");
													sDuration = aItems[aItems.length - 2].getBindingContext().getProperty("netDuration");
												} else {
													sQuantity = 0;
													sDuration = 0;
												}
											}
											oModel.remove(sObjectPath, {
												success: function () {
													// update performance values if the last measurement was deleted
													if (bLastMeasurement) { // there is a previous measurement
														that._updateTaskAfterNewMeasurement(sTaskID, sQuantity, sDuration);
													}
												},
												error: function (oError) {
													Log.error("Error deleting measurement");
												}
											});
										}
									}
								}
							);
							that.oNewMeasurementDialog.close();
						}
					}, {
						text: sCancel,
						enabled: true,
						visible: true,
						press: function () {
							that.oNewMeasurementDialog.close();
						}
					}]
				});

				that.oNewMeasurementDialog.addStyleClass("sapUiContentPadding");
				this.getView().addDependent(that.oNewMeasurementDialog);
			}
		},

		setMeasurementSurroundingValues: function (aItems) { // for edit mode only
			// set surrounding values for the measurement in the viewModel
			var oViewModel = this.getModel("detailView"),
				sMeasurementID = oViewModel.getProperty("/sMeasurementID"),
				sPreviousQuantity = "",
				sPreviousDuration = "",
				sNextQuantity = "",
				sNextDuration = "",
				iPressedMeasurement,
				oMeasurement;

			// find position of measurement 
			for (var i = 0; i < aItems.length; i++) {
				oMeasurement = aItems[i].getBindingContext().getObject();
				if (oMeasurement.ID === sMeasurementID) {
					iPressedMeasurement = i;
					break;
				}
			}
			// get values before and after
			if (iPressedMeasurement === 0) { //first row
				if (aItems.length > 1) { // next row exists
					sNextQuantity = aItems[iPressedMeasurement + 1].getBindingContext().getObject().measurementQuantity;
					sNextDuration = aItems[iPressedMeasurement + 1].getBindingContext().getObject().netDuration;
				}
			} else { // not first row
				sPreviousQuantity = aItems[iPressedMeasurement - 1].getBindingContext().getObject().measurementQuantity;
				sPreviousDuration = aItems[iPressedMeasurement - 1].getBindingContext().getObject().netDuration;
				if ((iPressedMeasurement + 1) < aItems.length) { // next row exists
					sNextQuantity = aItems[iPressedMeasurement + 1].getBindingContext().getObject().measurementQuantity;
					sNextDuration = aItems[iPressedMeasurement + 1].getBindingContext().getObject().netDuration;
				}
			}
			oViewModel.setProperty("/selectedMeasurement", iPressedMeasurement);
			oViewModel.setProperty("/previousQuantity", sPreviousQuantity);
			oViewModel.setProperty("/nextQuantity", sNextQuantity);
			oViewModel.setProperty("/previousDuration", sPreviousDuration);
			oViewModel.setProperty("/nextDuration", sNextDuration);
		},

		_validateEditMeasurement: function (mQuantity, mDuration) {
			// values must be compared as Numbers! mQuantity, mDuration are passed as numbers
			var oFrag = sap.ui.core.Fragment,
				oQuantity = oFrag.byId("myFrag", "quantity"),
				oDuration = oFrag.byId("myFrag", "duration"),
				oViewModel = this.getView().getModel("detailView"),
				mPreviousQuantity = Number(oViewModel.getProperty("/previousQuantity")),
				mPreviousDuration = Number(oViewModel.getProperty("/previousDuration")),
				mNextQuantity = Number(oViewModel.getProperty("/nextQuantity")),
				mNextDuration = Number(oViewModel.getProperty("/nextDuration")),
				bCreate = oViewModel.getProperty("/mode") === "Create",
				sEnterQuantity = this.getResourceBundle().getText("measurementInputStateEmptyQuantity"),
				sEnterDuration = this.getResourceBundle().getText("measurementInputStateEmptyDuration"),
				sQuantityMustBeGreater = this.getResourceBundle().getText("measurementInputStateQuantityMustBeGreater"),
				sQuantityMustBeSmaller = this.getResourceBundle().getText("measurementInputStateQuantityMustBeSmaller"),
				sQuantityMustBeAndSmaller = this.getResourceBundle().getText("measurementInputStateQuantityMustBeAndSmaller"),
				sDurationMustBeGreater = this.getResourceBundle().getText("measurementInputStateDurationMustBeGreater"),
				sDurationMustBeSmaller = this.getResourceBundle().getText("measurementInputStateDurationMustBeSmaller"),
				sDurationMustBeAndSmaller = this.getResourceBundle().getText("measurementInputStateDurationMustBeAndSmaller");

			oQuantity.setValueState("None");
			oDuration.setValueState("None");

			if (!mQuantity || mQuantity === 0) {
				oQuantity.setValueState("Error");
				oQuantity.setValueStateText(sEnterQuantity);
				return false;
			}
			if (!mDuration || mDuration === 0) {
				oDuration.setValueState("Error");
				oDuration.setValueStateText(sEnterDuration);
				return false;
			}
			if (bCreate) {
				if (mQuantity <= mPreviousQuantity) {
					oQuantity.setValueState("Error");
					oQuantity.setValueStateText(sQuantityMustBeGreater + " " + mPreviousQuantity);
					return false;
				} else if (mDuration <= mPreviousDuration) {
					oDuration.setValueState("Error");
					oDuration.setValueStateText(sDurationMustBeGreater + " " + mPreviousDuration);
					return false;
				} else {
					return true;
				}
			}

			if (mPreviousQuantity > 0) { // not the first measurement
				if (mNextQuantity > 0) { // not the last measurement
					if (mQuantity <= mPreviousQuantity || mQuantity >= mNextQuantity) {
						oQuantity.setValueState("Error");
						oQuantity.setValueStateText(sQuantityMustBeGreater + " " + mPreviousQuantity + " " + sQuantityMustBeAndSmaller + " " +
							mNextQuantity);
						return false;
					}
				} else if (mQuantity <= mPreviousQuantity) { // last measurement
					oQuantity.setValueState("Error");
					oQuantity.setValueStateText(sQuantityMustBeGreater + " " + mPreviousQuantity);
					return false;
				}
			} else if (mNextQuantity > 0 && mQuantity >= mNextQuantity) { // first measurement
				oQuantity.setValueState("Error");
				oQuantity.setValueStateText(sQuantityMustBeSmaller + " " + mNextQuantity);
				return false;
			}

			if (mPreviousDuration > 0) { // not the first measurement
				if (mNextDuration > 0) { // not the last measurement
					if (mDuration <= mPreviousDuration || mDuration >= mNextDuration) {
						oDuration.setValueState("Error");
						oDuration.setValueStateText(sDurationMustBeGreater + " " + mPreviousDuration + " " + sDurationMustBeAndSmaller + " " +
							mNextDuration);
						return false;
					}
				} else if (mDuration <= mPreviousDuration) { // last measurement
					oDuration.setValueState("Error");
					oDuration.setValueStateText(sDurationMustBeGreater + " " + mPreviousDuration);
					return false;
				}
			} else { // first measurement
				if (mNextDuration > 0 && mDuration >= mNextDuration) {
					oDuration.setValueState("Error");
					oDuration.setValueStateText(sDurationMustBeSmaller + " " + mNextDuration);
					return false;
				}
			}
			return true;
		},

		updateButtonEnabledState: function (sQuantity, sDuration, sOldQuantity, sOldDuration, aButtons, bCreate) {
			var bEnabled = sQuantity !== "" && sDuration !== "",
				oFrag = sap.ui.core.Fragment,
				bQuantityError = oFrag.byId("myFrag", "quantity").getValueState() === "Error",
				//bDurationError = oFrag.byId("myFrag", "duration").getValueState() === "Error",
				sCreateButtonText = this.getResourceBundle().getText("measurementDialogCreateButtonText"),
				sSaveButtonText = this.getResourceBundle().getText("measurementDialogSaveButtonText"),
				sDeleteButtonText = this.getResourceBundle().getText("measurementDialogDeleteButtonText"),
				sCancelButtonText = this.getResourceBundle().getText("measurementDialogCancelButtonText");

			// no better way identifying buttons? (no ID?)
			for (var i = 0; i < aButtons.length; i++) {
				if (aButtons[i].getText() === sCreateButtonText && bCreate && !bQuantityError && bEnabled) {
					aButtons[i].setEnabled(bEnabled);
					aButtons[i].setVisible(true);
				}
				if (aButtons[i].getText() === sSaveButtonText && !bCreate && sQuantity !== sOldQuantity && !bQuantityError && bEnabled) {
					aButtons[i].setEnabled(bEnabled);
					aButtons[i].setVisible(true);
				}
				if (aButtons[i].getText() === sDeleteButtonText && !bCreate) {
					aButtons[i].setEnabled(bEnabled);
					aButtons[i].setVisible(true);
				}
				if (aButtons[i].getText() === sCancelButtonText) {
					aButtons[i].setEnabled(true);
					aButtons[i].setVisible(true);
				}
			}
		},

		_updateTaskAfterNewMeasurement: function (sTaskID, quantity, duration) {
			// quantity, duration are from last measurement (=actual)
			var oModel = this.getModel(),
				sPath = "/" + oModel.createKey("Tasks", {
					ID: sTaskID
				}),
				oTask = oModel.getObject(sPath, {
					select: "*"
				}),
				oBC = this.getView().getBindingContext(),
				oShift = this.getShiftFromID(oBC.getProperty("shift_ID")),
				oNow = new Date();

			oTask.currentProductivity = (quantity === 0) ? oTask.plannedProductivity : parseFloat(quantity / duration).toFixed(3);
			oTask.KPI = parseFloat(oTask.currentProductivity / (oTask.plannedProductivity * oTask.productivityFactor)).toFixed(3);
			// calculate duration and end date based on remaining quantity and current productivity
			if (oTask.quantity - quantity > 0) { // otherwise extra work
				oTask.estimatedEnd = this.getEndDateInWorkingHours(oNow, oTask.quantity - quantity, oTask.currentProductivity, oShift);
			} else {
				oTask.estimatedEnd = oNow;
				if (!this.inShift(oNow, oShift)) {
					oTask.estimatedEnd = this.getShiftEnd(oNow, oShift);
				} else {
					oTask.estimatedEnd = oNow;
				}
			}
			// update actualQuantity and subby total actual cost if not lump sum
			oTask.actualQuantity = parseFloat(quantity).toFixed(3);
			if (oTask.price && !oTask.lumpsum) { // unit rate contract
				oTask.actualTotalPrice = parseFloat(oTask.actualQuantity * oTask.price).toFixed(3);
			}
			oModel.update(sPath, oTask, {
				error: function (oError) {
					Log.error("Error updating task after measurement change");
				}
			});
		},

		//////////////////////////// Problem Cards /////////////////////////////////////

		onAddProblem: function () {
			var oFrag = sap.ui.core.Fragment,
				oShortText,
				oProblemType,
				oSeverityType,
				aButtons,
				oViewModel = this.getModel("detailView");

			oViewModel.setProperty("/mode", "Create");
			this._createProblemDialog(true);

			oShortText = oFrag.byId("myProblemFrag", "shortText");
			oProblemType = oFrag.byId("myProblemFrag", "problemType");
			oSeverityType = oFrag.byId("myProblemFrag", "severityType");
			aButtons = this.oProblemDialog.getButtons();
			oShortText.setValue("");
			oProblemType.setSelectedKey("");
			oSeverityType.setSelectedKey("");

			this._enableProblemDialogButtons();
			if (this.oProblemDialog) {
				var sTitle = this.getResourceBundle().getText("problemDialogCreateTitle");
				this.oProblemDialog.setTitle(sTitle);
			}
			this.oProblemDialog.open();
		},

		onEditProblem: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				oShortText,
				oProblemType,
				oSeverityType,
				aButtons,
				oViewModel = this.getModel("detailView"),
				oProblemBC = oEvent.getSource().getBindingContext(),
				sProblemID = oProblemBC.getProperty("ID"),
				sShortText = oProblemBC.getProperty("shortText"),
				sProblemType = oProblemBC.getProperty("problem_ID"),
				sSeverityType = oProblemBC.getProperty("severity_ID");

			oViewModel.setProperty("/mode", "Edit");
			oViewModel.setProperty("/problemID", sProblemID);
			this._createProblemDialog(false);

			oShortText = oFrag.byId("myProblemFrag", "shortText");
			oProblemType = oFrag.byId("myProblemFrag", "problemType");
			oSeverityType = oFrag.byId("myProblemFrag", "severityType");
			aButtons = this.oProblemDialog.getButtons();
			oShortText.setValue(sShortText);
			oProblemType.setSelectedKey(sProblemType);
			oSeverityType.setSelectedKey(sSeverityType);

			this._enableProblemDialogButtons();
			if (this.oProblemDialog) {
				var sTitle = this.getResourceBundle().getText("problemDialogEditTitle");
				this.oProblemDialog.setTitle(sTitle);
			}
			this.oProblemDialog.open();
		},

		handleProblemChange: function () {
			var oFrag = sap.ui.core.Fragment,
				oShortText = oFrag.byId("myProblemFrag", "shortText"),
				sShortText = oShortText.getValue();
			if (sShortText.length === 0) {
				var sValueStateText = this.getResourceBundle().getText("problemEmptyDescription");
				oShortText.setValueState("Error");
				oShortText.setValueStateText(sValueStateText);
			} else {
				oShortText.setValueState("None");
				oShortText.setValueStateText("");
			}
			this._enableProblemDialogButtons();
		},

		_enableProblemDialogButtons: function () {
			var oFrag = sap.ui.core.Fragment,
				oViewModel = this.getView().getModel("detailView"),
				bCreate = oViewModel.getProperty("/mode") === "Create",
				aButtons = this.oProblemDialog.getButtons(),
				sShortText = oFrag.byId("myProblemFrag", "shortText").getValue(),
				sProblemType = oFrag.byId("myProblemFrag", "problemType").getSelectedKey(),
				sSeverityType = oFrag.byId("myProblemFrag", "severityType").getSelectedKey(),
				bCanCreate = sShortText !== "" && sProblemType !== "" && sSeverityType !== "";
			for (var i = 0; i < 3; i++) {
				aButtons[i].setVisible(false);
				aButtons[i].setEnabled(false);
			}
			if (bCreate) {
				aButtons[0].setVisible(true); //create
				if (bCanCreate) {
					aButtons[0].setEnabled(true);
				}
			} else { // save, delete
				var oModel = this.getModel(),
					sProblemID = oViewModel.getProperty("/problemID"),
					sProblemPath = this.getModel().createKey("/ProblemCards", {
						ID: sProblemID
					}),
					oProblem = oModel.getObject(sProblemPath, {
						select: "*"
					}),
					bTextChange = oProblem.shortText !== sShortText,
					bProblemChange = oProblem.problemID !== sProblemType,
					bSeverityChange = oProblem.severity_ID !== sSeverityType,
					bChange = bTextChange || bProblemChange || bSeverityChange,
					bCanSave = bCanCreate && bChange;
				if (bCanSave) {
					aButtons[1].setVisible(true); // save
					aButtons[1].setEnabled(true);
				}
				aButtons[2].setVisible(true); // delete
				aButtons[2].setEnabled(true);
			}
		},

		_createProblemDialog: function (bCreate) {
			var oFrag = sap.ui.core.Fragment,
				that = this,
				sShortText,
				sProblemType,
				sSeverityType,
				oModel,
				sProblemID,
				sProblemPath,
				oProblem,
				oProblemContext,
				oViewModel = this.getView().getModel("detailView"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sTaskID = oViewModel.getProperty("/taskID"),
				sTitle = "",
				sCancel = this.getResourceBundle().getText("cancelButtonText"),
				sSave = this.getResourceBundle().getText("saveButtonText"),
				sCreate = this.getResourceBundle().getText("createButtonText"),
				sDelete = this.getResourceBundle().getText("deleteButtonText"),
				sConfirmText = this.getResourceBundle().getText("problemDialogConfirmDeleteText"),
				sConfirmTitle = this.getResourceBundle().getText("problemDialogConfirmDeleteTitle");

			if (bCreate) {
				sTitle = this.getResourceBundle().getText("problemDialogCreateTitle");
			} else {
				sTitle = this.getResourceBundle().getText("problemDialogEditTitle");
			}

			if (!that.oProblemDialog) {

				that.oProblemDialog = new Dialog({
					title: sTitle,
					content: [
						sap.ui.xmlfragment("myProblemFrag", "site.recorder.SiteRecorder.view.AddProblemCard", this)
					],
					buttons: [{
						text: sCreate,
						enabled: false,
						visible: bCreate,
						press: function () {
							sShortText = oFrag.byId("myProblemFrag", "shortText").getValue();
							sProblemType = oFrag.byId("myProblemFrag", "problemType").getSelectedKey();
							sSeverityType = oFrag.byId("myProblemFrag", "severityType").getSelectedKey();
							oModel = that.getModel();
							oProblemContext = oModel.createEntry("/ProblemCards", {
								properties: {
									project_ID: sProjectID,
									task_ID: sTaskID,
									shortText: sShortText,
									problemDateTime: new Date(),
									isProblem: true,
									problem_ID: sProblemType,
									severity_ID: sSeverityType
								}
							});
							that.getView().setBindingContext(oProblemContext);
							oModel.submitChanges();
							that.oProblemDialog.close();
						}
					}, {
						text: sSave,
						enabled: false,
						visible: !bCreate,
						press: function () {
							sShortText = oFrag.byId("myProblemFrag", "shortText").getValue();
							sProblemType = oFrag.byId("myProblemFrag", "problemType").getSelectedKey();
							sSeverityType = oFrag.byId("myProblemFrag", "severityType").getSelectedKey();
							oModel = that.getModel();
							sProblemID = that.getModel("detailView").getProperty("/problemID");
							sProblemPath = that.getModel().createKey("/ProblemCards", {
								ID: sProblemID
							});
							oProblem = oModel.getObject(sProblemPath, {
								select: "*"
							});
							oProblem.shortText = sShortText;
							oProblem.problem_ID = sProblemType;
							oProblem.severity_ID = sSeverityType;
							oModel.update(sProblemPath, oProblem);
							that.oProblemDialog.close();
						}
					}, {
						text: sDelete,
						enabled: !bCreate,
						press: function () {

							oModel = that.getModel();
							sProblemID = that.getModel("detailView").getProperty("/problemID");
							sProblemPath = that.getModel().createKey("/ProblemCards", {
								ID: sProblemID
							});
							MessageBox.confirm(
								sConfirmText, {
									icon: MessageBox.Icon.WARNING,
									title: sConfirmTitle,
									actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
									initialFocus: MessageBox.Action.CANCEL,
									onClose: function (sAction) {
										if (sAction === "OK") {
											oModel.remove(sProblemPath);
										}
									}
								}
							);
							that.oProblemDialog.close();
						}
					}, {
						text: sCancel,
						enabled: true,
						press: function () {
							that.oProblemDialog.close();
						}
					}]
				});

				that.oProblemDialog.addStyleClass("sapUiContentPadding");
				that.getView().addDependent(that.oProblemDialog);
			}
		},

		onProblemListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("problemsList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("detailView");

			// only update the counter if the length is final
			if (oList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("problemTableHeadingCount", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("problemTableHeading");
				}
				oViewModel.setProperty("/problemItemListTitle", sTitle);
				oViewModel.setProperty("/countProblemCards", iTotalItems);
			}
		},

		/////////////////////////////////////////////////////////////////QUALITY////////////////////////////////////

		onAddQuality: function () {
			var oFrag = sap.ui.core.Fragment,
				oShortText,
				oQualityType,
				oSeverityType,
				aButtons,
				oViewModel = this.getModel("detailView");

			oViewModel.setProperty("/mode", "Create");
			this._createQualityDialog(true);

			oShortText = oFrag.byId("myQualityFrag", "shortText");
			oQualityType = oFrag.byId("myQualityFrag", "qualityType");
			oSeverityType = oFrag.byId("myQualityFrag", "severityType");
			aButtons = this.oQualityDialog.getButtons();
			oShortText.setValue("");
			oQualityType.setSelectedKey("");
			oSeverityType.setSelectedKey("");

			this._enableQualityDialogButtons();
			if (this.oQualityDialog) {
				var sTitle = this.getResourceBundle().getText("qualityDialogCreateTitle");
				this.oQualityDialog.setTitle(sTitle);
			}
			this.oQualityDialog.open();
		},

		onEditQuality: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				oShortText,
				oQualityType,
				oSeverityType,
				aButtons,
				oViewModel = this.getModel("detailView"),
				oQualityBC = oEvent.getSource().getBindingContext(),
				sQualityID = oQualityBC.getProperty("ID"),
				sShortText = oQualityBC.getProperty("shortText"),
				sQualityType = oQualityBC.getProperty("quality_ID"),
				sSeverityType = oQualityBC.getProperty("severity_ID");

			oViewModel.setProperty("/mode", "Edit");
			oViewModel.setProperty("/qualityID", sQualityID);
			this._createQualityDialog(false);

			oShortText = oFrag.byId("myQualityFrag", "shortText");
			oQualityType = oFrag.byId("myQualityFrag", "qualityType");
			oSeverityType = oFrag.byId("myQualityFrag", "severityType");
			aButtons = this.oQualityDialog.getButtons();
			oShortText.setValue(sShortText);
			oQualityType.setSelectedKey(sQualityType);
			oSeverityType.setSelectedKey(sSeverityType);

			this._enableQualityDialogButtons();
			if (this.oQualityDialog) {
				var sTitle = this.getResourceBundle().getText("qualityDialogEditTitle");
				this.oQualityDialog.setTitle(sTitle);
			}
			this.oQualityDialog.open();
		},

		handleQualityChange: function () {
			var oFrag = sap.ui.core.Fragment,
				oShortText = oFrag.byId("myQualityFrag", "shortText"),
				sShortText = oShortText.getValue();
			if (sShortText.length === 0) {
				var sValueStateText = this.getResourceBundle().getText("qualityEmptyDescription");
				oShortText.setValueState("Error");
				oShortText.setValueStateText(sValueStateText);
			} else {
				oShortText.setValueState("None");
				oShortText.setValueStateText("");
			}
			this._enableQualityDialogButtons();
		},

		_enableQualityDialogButtons: function () {
			var oFrag = sap.ui.core.Fragment,
				oViewModel = this.getView().getModel("detailView"),
				bCreate = oViewModel.getProperty("/mode") === "Create",
				aButtons = this.oQualityDialog.getButtons(),
				sShortText = oFrag.byId("myQualityFrag", "shortText").getValue(),
				sQualityType = oFrag.byId("myQualityFrag", "qualityType").getSelectedKey(),
				sSeverityType = oFrag.byId("myQualityFrag", "severityType").getSelectedKey(),
				bCanCreate = sShortText !== "" && sQualityType !== "" && sSeverityType !== "";
			for (var i = 0; i < 3; i++) {
				aButtons[i].setVisible(false);
				aButtons[i].setEnabled(false);
			}
			if (bCreate) {
				aButtons[0].setVisible(true); //create
				if (bCanCreate) {
					aButtons[0].setEnabled(true);
				}
			} else { // save, delete
				var oModel = this.getModel(),
					sQualityID = oViewModel.getProperty("/qualityID"),
					sQualityPath = this.getModel().createKey("/ProblemCards", {
						ID: sQualityID
					}),
					oQuality = oModel.getObject(sQualityPath, {
						select: "*"
					}),
					bTextChange = oQuality.shortText !== sShortText,
					bQualityChange = oQuality.quality_ID !== sQualityType,
					bSeverityChange = oQuality.severity_ID !== sSeverityType,
					bChange = bTextChange || bQualityChange || bSeverityChange,
					bCanSave = bCanCreate && bChange;
				if (bCanSave) {
					aButtons[1].setVisible(true); // save
					aButtons[1].setEnabled(true);
				}
				aButtons[2].setVisible(true); // delete
				aButtons[2].setEnabled(true);
			}
		},

		_createQualityDialog: function (bCreate) {
			var oFrag = sap.ui.core.Fragment,
				that = this,
				sShortText,
				sQualityType,
				sSeverityType,
				oModel,
				sQualityID,
				sQualityPath,
				oQuality,
				oQualityContext,
				oViewModel = this.getView().getModel("detailView"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sTaskID = oViewModel.getProperty("/taskID"),
				sTitle = "",
				sCancel = this.getResourceBundle().getText("cancelButtonText"),
				sSave = this.getResourceBundle().getText("saveButtonText"),
				sCreate = this.getResourceBundle().getText("createButtonText"),
				sDelete = this.getResourceBundle().getText("deleteButtonText"),
				sConfirmText = this.getResourceBundle().getText("qualityDialogConfirmDeleteText"),
				sConfirmTitle = this.getResourceBundle().getText("qualityDialogConfirmDeleteTitle");

			if (bCreate) {
				sTitle = this.getResourceBundle().getText("qualityDialogCreateTitle");
			} else {
				sTitle = this.getResourceBundle().getText("qualityDialogEditTitle");
			}

			if (!that.oQualityDialog) {

				that.oQualityDialog = new Dialog({
					title: sTitle,
					content: [
						sap.ui.xmlfragment("myQualityFrag", "site.recorder.SiteRecorder.view.AddQualityCard", this)
					],
					buttons: [{
						text: sCreate,
						enabled: false,
						visible: bCreate,
						press: function () {
							sShortText = oFrag.byId("myQualityFrag", "shortText").getValue();
							sQualityType = oFrag.byId("myQualityFrag", "qualityType").getSelectedKey();
							sSeverityType = oFrag.byId("myQualityFrag", "severityType").getSelectedKey();
							oModel = that.getModel();
							oQualityContext = oModel.createEntry("/ProblemCards", {
								properties: {
									project_ID: sProjectID,
									task_ID: sTaskID,
									shortText: sShortText,
									problemDateTime: new Date(),
									isQuality: true,
									quality_ID: sQualityType,
									severity_ID: sSeverityType
								}
							});
							that.getView().setBindingContext(oQualityContext);
							oModel.submitChanges();
							that.oQualityDialog.close();
						}
					}, {
						text: sSave,
						enabled: false,
						visible: !bCreate,
						press: function () {
							sShortText = oFrag.byId("myQualityFrag", "shortText").getValue();
							sQualityType = oFrag.byId("myQualityFrag", "qualityType").getSelectedKey();
							sSeverityType = oFrag.byId("myQualityFrag", "severityType").getSelectedKey();
							oModel = that.getModel();
							sQualityID = that.getModel("detailView").getProperty("/qualityID");
							sQualityPath = that.getModel().createKey("/ProblemCards", {
								ID: sQualityID
							});
							oQuality = oModel.getObject(sQualityPath, {
								select: "*"
							});
							oQuality.shortText = sShortText;
							oQuality.quality_ID = sQualityType;
							oQuality.severity_ID = sSeverityType;
							oModel.update(sQualityPath, oQuality);
							that.oQualityDialog.close();
						}
					}, {
						text: sDelete,
						enabled: !bCreate,
						press: function () {

							oModel = that.getModel();
							sQualityID = that.getModel("detailView").getProperty("/qualityID");
							sQualityPath = that.getModel().createKey("/ProblemCards", {
								ID: sQualityID
							});
							MessageBox.confirm(
								sConfirmText, {
									icon: MessageBox.Icon.WARNING,
									title: sConfirmTitle,
									actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
									initialFocus: MessageBox.Action.CANCEL,
									onClose: function (sAction) {
										if (sAction === "OK") {
											oModel.remove(sQualityPath);
										}
									}
								}
							);
							that.oQualityDialog.close();
						}
					}, {
						text: sCancel,
						enabled: true,
						press: function () {
							that.oQualityDialog.close();
						}
					}]
				});

				that.oQualityDialog.addStyleClass("sapUiContentPadding");
				that.getView().addDependent(that.oQualityDialog);
			}
		},

		onQualityListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("qualityList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("detailView");

			// only update the counter if the length is final
			if (oList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("qualityTableHeadingCount", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("qualityTableHeading");
				}
				oViewModel.setProperty("/qualityItemListTitle", sTitle);
				oViewModel.setProperty("/countQualityCards", iTotalItems);
			}
		},

		/////////////////////////////////////////////////////////////////Health & Safety////////////////////////////////////

		onAddHnS: function () {
			var oFrag = sap.ui.core.Fragment,
				oShortText,
				oHnSType,
				oSeverityType,
				aButtons,
				oViewModel = this.getModel("detailView");

			oViewModel.setProperty("/mode", "Create");
			this._createHnSDialog(true);

			oShortText = oFrag.byId("myHnSFrag", "shortText");
			oHnSType = oFrag.byId("myHnSFrag", "HnSType");
			oSeverityType = oFrag.byId("myHnSFrag", "severityType");
			aButtons = this.oHnSDialog.getButtons();
			oShortText.setValue("");
			oHnSType.setSelectedKey("");
			oSeverityType.setSelectedKey("");

			this._enableHnSDialogButtons();
			if (this.oHnSDialog) {
				var sTitle = this.getResourceBundle().getText("HnSDialogCreateTitle");
				this.oHnSDialog.setTitle(sTitle);
			}
			this.oHnSDialog.open();
		},

		onEditHnS: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				oShortText,
				oHnSType,
				oSeverityType,
				aButtons,
				oViewModel = this.getModel("detailView"),
				oHnSBC = oEvent.getSource().getBindingContext(),
				sHnSID = oHnSBC.getProperty("ID"),
				sShortText = oHnSBC.getProperty("shortText"),
				sHnSType = oHnSBC.getProperty("HealthandSafety_ID"),
				sSeverityType = oHnSBC.getProperty("severity_ID");

			oViewModel.setProperty("/mode", "Edit");
			oViewModel.setProperty("/HnSID", sHnSID);
			this._createHnSDialog(false);

			oShortText = oFrag.byId("myHnSFrag", "shortText");
			oHnSType = oFrag.byId("myHnSFrag", "HnSType");
			oSeverityType = oFrag.byId("myHnSFrag", "severityType");
			aButtons = this.oHnSDialog.getButtons();
			oShortText.setValue(sShortText);
			oHnSType.setSelectedKey(sHnSType);
			oSeverityType.setSelectedKey(sSeverityType);

			this._enableHnSDialogButtons();
			if (this.oHnSDialog) {
				var sTitle = this.getResourceBundle().getText("HnSDialogEditTitle");
				this.oHnSDialog.setTitle(sTitle);
			}
			this.oHnSDialog.open();
		},

		handleHnSChange: function () {
			var oFrag = sap.ui.core.Fragment,
				oShortText = oFrag.byId("myHnSFrag", "shortText"),
				sShortText = oShortText.getValue();
			if (sShortText.length === 0) {
				var sValueStateText = this.getResourceBundle().getText("HnSEmptyDescription");
				oShortText.setValueState("Error");
				oShortText.setValueStateText(sValueStateText);
			} else {
				oShortText.setValueState("None");
				oShortText.setValueStateText("");
			}
			this._enableHnSDialogButtons();
		},

		_enableHnSDialogButtons: function () {
			var oFrag = sap.ui.core.Fragment,
				oViewModel = this.getView().getModel("detailView"),
				bCreate = oViewModel.getProperty("/mode") === "Create",
				aButtons = this.oHnSDialog.getButtons(),
				sShortText = oFrag.byId("myHnSFrag", "shortText").getValue(),
				sHnSType = oFrag.byId("myHnSFrag", "HnSType").getSelectedKey(),
				sSeverityType = oFrag.byId("myHnSFrag", "severityType").getSelectedKey(),
				bCanCreate = sShortText !== "" && sHnSType !== "" && sSeverityType !== "";
			for (var i = 0; i < 3; i++) {
				aButtons[i].setVisible(false);
				aButtons[i].setEnabled(false);
			}
			if (bCreate) {
				aButtons[0].setVisible(true); //create
				if (bCanCreate) {
					aButtons[0].setEnabled(true);
				}
			} else { // save, delete
				var oModel = this.getModel(),
					sHnSID = oViewModel.getProperty("/HnSID"),
					sHnSPath = this.getModel().createKey("/ProblemCards", {
						ID: sHnSID
					}),
					oHnS = oModel.getObject(sHnSPath, {
						select: "*"
					}),
					bTextChange = oHnS.shortText !== sShortText,
					bHnSChange = oHnS.HnS_ID !== sHnSType,
					bSeverityChange = oHnS.severity_ID !== sSeverityType,
					bChange = bTextChange || bHnSChange || bSeverityChange,
					bCanSave = bCanCreate && bChange;
				if (bCanSave) {
					aButtons[1].setVisible(true); // save
					aButtons[1].setEnabled(true);
				}
				aButtons[2].setVisible(true); // delete
				aButtons[2].setEnabled(true);
			}
		},

		_createHnSDialog: function (bCreate) {
			var oFrag = sap.ui.core.Fragment,
				that = this,
				sShortText,
				sHnSType,
				sSeverityType,
				oModel,
				sHnSID,
				sHnSPath,
				oHnS,
				oHnSContext,
				oViewModel = this.getModel("detailView"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sTaskID = oViewModel.getProperty("/taskID"),
				sTitle = "",
				sCancel = this.getResourceBundle().getText("cancelButtonText"),
				sSave = this.getResourceBundle().getText("saveButtonText"),
				sCreate = this.getResourceBundle().getText("createButtonText"),
				sDelete = this.getResourceBundle().getText("deleteButtonText"),
				sConfirmText = this.getResourceBundle().getText("HnSDialogConfirmDeleteText"),
				sConfirmTitle = this.getResourceBundle().getText("HnSDialogConfirmDeleteTitle");

			if (bCreate) {
				sTitle = this.getResourceBundle().getText("HnSDialogCreateTitle");
			} else {
				sTitle = this.getResourceBundle().getText("HnSDialogEditTitle");
			}

			if (!that.oHnSDialog) {

				that.oHnSDialog = new Dialog({
					title: sTitle,
					content: [
						sap.ui.xmlfragment("myHnSFrag", "site.recorder.SiteRecorder.view.AddHnSCard", this)
					],
					buttons: [{
						text: sCreate,
						enabled: false,
						visible: bCreate,
						press: function () {
							sShortText = oFrag.byId("myHnSFrag", "shortText").getValue();
							sHnSType = oFrag.byId("myHnSFrag", "HnSType").getSelectedKey();
							sSeverityType = oFrag.byId("myHnSFrag", "severityType").getSelectedKey();
							oModel = that.getModel();
							oHnSContext = oModel.createEntry("/ProblemCards", {
								properties: {
									project_ID: sProjectID,
									task_ID: sTaskID,
									shortText: sShortText,
									problemDateTime: new Date(),
									isHnS: true,
									HealthandSafety_ID: sHnSType,
									severity_ID: sSeverityType
								}
							});
							that.getView().setBindingContext(oHnSContext);
							oModel.submitChanges();
							that.oHnSDialog.close();
						}
					}, {
						text: sSave,
						enabled: false,
						visible: !bCreate,
						press: function () {
							sShortText = oFrag.byId("myHnSFrag", "shortText").getValue();
							sHnSType = oFrag.byId("myHnSFrag", "HnSType").getSelectedKey();
							sSeverityType = oFrag.byId("myHnSFrag", "severityType").getSelectedKey();
							oModel = that.getModel();
							sHnSID = that.getModel("detailView").getProperty("/HnSID");
							sHnSPath = that.getModel().createKey("/ProblemCards", {
								ID: sHnSID
							});
							oHnS = oModel.getObject(sHnSPath, {
								select: "*"
							});
							oHnS.shortText = sShortText;
							oHnS.HealthandSafety_ID = sHnSType;
							oHnS.severity_ID = sSeverityType;
							oModel.update(sHnSPath, oHnS);
							that.oHnSDialog.close();
						}
					}, {
						text: sDelete,
						enabled: !bCreate,
						press: function () {

							oModel = that.getModel();
							sHnSID = that.getModel("detailView").getProperty("/HnSID");
							sHnSPath = that.getModel().createKey("/ProblemCards", {
								ID: sHnSID
							});
							MessageBox.confirm(
								sConfirmText, {
									icon: MessageBox.Icon.WARNING,
									title: sConfirmTitle,
									actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
									initialFocus: MessageBox.Action.CANCEL,
									onClose: function (sAction) {
										if (sAction === "OK") {
											oModel.remove(sHnSPath);
										}
									}
								}
							);
							that.oHnSDialog.close();
						}
					}, {
						text: sCancel,
						enabled: true,
						press: function () {
							that.oHnSDialog.close();
						}
					}]
				});

				that.oHnSDialog.addStyleClass("sapUiContentPadding");
				that.getView().addDependent(that.oHnSDialog);
			}
		},

		onHnSListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("HnSList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("detailView");

			// only update the counter if the length is final
			if (oList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("HnSTableHeadingCount", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("HnSTableHeading");
				}
				oViewModel.setProperty("/HnSItemListTitle", sTitle);
				oViewModel.setProperty("/countHnSCards", iTotalItems);
			}
		},
		/**
		 * Set the full screen mode to false and navigate to master page
		 */
		onCloseDetailPress: function () {
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
			// No item should be selected on master after detail page is closed
			this.getOwnerComponent().oListSelector.clearMasterListSelection();
			this.getRouter().navTo("master");
		},

		/**
		 * Toggle between full and non full screen mode.
		 */
		toggleFullScreen: function () {
			var bFullScreen = this.getModel("appView").getProperty("/actionButtonsInfo/midColumn/fullScreen");
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", !bFullScreen);
			if (!bFullScreen) {
				// store current layout and go full screen
				this.getModel("appView").setProperty("/previousLayout", this.getModel("appView").getProperty("/layout"));
				this.getModel("appView").setProperty("/layout", "MidColumnFullScreen");
			} else {
				// reset to previous layout
				this.getModel("appView").setProperty("/layout", this.getModel("appView").getProperty("/previousLayout"));
			}
		}
	});

});