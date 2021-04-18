sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"../model/formatter",
	"sap/ui/core/format/DateFormat"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator, Sorter, formatter, DateFormat) {
	"use strict";

	return BaseController.extend("project.data.ProjectData.controller.Shifts", {

		formatter: formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		onInit: function () {
			// Model used to manipulate control states. The chosen values make sure,
			// detail page is busy indication immediately so there is no break in
			// between the busy indication for loading the view's meta data
			var oViewModel = new JSONModel({
				busy: false,
				delay: 0,
				mode: "None",
				enableSave: false,
				lineItemTableDelay: 0,
				shiftsTitle: "",
				shiftID: "",
				shiftPartsListTitle: "",
				shiftPartsOnEdit: false,
				timeTypesPath: ""
			});
			this.setModel(oViewModel, "shiftsView");

			this.getRouter().getRoute("Shifts").attachPatternMatched(this._onObjectMatched, this);
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		_onObjectMatched: function (oEvent) {
			var oModel = this.getModel(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sObjectId = oEvent.getParameter("arguments").objectId,
				sPath,
				sTitle,
				getProjectTimeTypes = function (sTTPath) {
					return new Promise(function (resolve, reject) {
						oModel.read(sTTPath, {
							urlParameters: {
								$inlinecount: "allpages"
							},
							success: function (aProjectTimeTypes) {
								if (aProjectTimeTypes.results.length > 0) {
									resolve(aProjectTimeTypes.results);
								} else {
									resolve([]);
								}
							},
							error: function () {
								resolve([]);
							}
						});
					});
				};
			// sMode = oEvent.getParameter("arguments").mode; doesn't work here; detect mode by appView/value of sObjectId
			if (!sProjectID || sProjectID === "") { // sometimes this event is triggered before navigating to this view
				return;
			}
			if (this.getModel("appView").getProperty("mode") === "Create" || sObjectId === "xxx") { // revisit: passing an undefined objectId doesn't work
				sTitle = this.getResourceBundle().getText("shiftViewTitleCreate");
				this.getModel("shiftsView").setProperty("/shiftID", "");
				this.getModel("shiftsView").setProperty("/mode", "Create");
				this.byId("code").setValue("");
				this.byId("defaultShift").setSelected(false);
				this.byId("ignoreWeekends").setSelected(false);
				this.byId("ignoreHolidays").setSelected(false);
			} else { // Edit
				sTitle = this.getResourceBundle().getText("shiftViewTitleEdit");
				this.getModel("shiftsView").setProperty("/mode", "Edit");
				this.getModel().metadataLoaded().then(function () {
					sPath = this.getModel().createKey("Shifts", {
						ID: sObjectId
					});
					this._bindView("/" + sPath);
				}.bind(this));
			}
			this.byId("titleId").setText(sTitle);
			this.getModel("shiftsView").setProperty("/shiftID", sObjectId);

			// filter the time types in the select for project
			// revisit: this model should be created in the detail view; but it doesn't get propagated
			var sTimeTypesPath = "/" + oModel.createKey("Projects", {
					ID: sProjectID
				}) + "/timeTypes",
				oItem = {},
				aTimeTypes = [],
				timeTypesModel = new sap.ui.model.json.JSONModel(),
				that = this;
			this.getModel("shiftsView").setProperty("/timeTypesPath", sTimeTypesPath);
			getProjectTimeTypes(sTimeTypesPath).then(function (aProjectTimeTypes) {
				for (var i = 0; i < aProjectTimeTypes.length; i++) {
					oItem = {
						ID: aProjectTimeTypes[i].ID,
						code: aProjectTimeTypes[i].code
					};
					aTimeTypes.push(oItem);
				}
				timeTypesModel.setData({
					timeTypesArray: aTimeTypes
				});
				that.setModel(timeTypesModel, "timeTypesModel");
			});
		},

		_bindView: function (sObjectPath) {
			// Set busy indicator during view binding
			var oViewModel = this.getModel("shiftsView");

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
				return;
			}
			/*
						var sPath = oElementBinding.getPath(),
							oResourceBundle = this.getResourceBundle(),
							oObject = oView.getModel().getObject(sPath),
							sObjectId = oObject.ID,
							sObjectName = oObject.code,
							oViewModel = this.getModel("shiftsView");

						//this.getOwnerComponent().oListSelector.selectAListItem(sPath);
						//this._setDates();

						//this.getModel("appView").setProperty("/selectedProjectID", sObjectId);
						oViewModel.setProperty("/saveAsTileTitle", oResourceBundle.getText("shareSaveTileAppTitle", [sObjectName]));
						oViewModel.setProperty("/shareOnJamTitle", sObjectName);
						oViewModel.setProperty("/shareSendEmailSubject",
							oResourceBundle.getText("shareSendEmailObjectSubject", [sObjectId]));
						oViewModel.setProperty("/shareSendEmailMessage",
							oResourceBundle.getText("shareSendEmailObjectMessage", [sObjectName, sObjectId, location.href])); */
		},

		handleShiftPartsChange: function (oEvent) {
			var oSource = oEvent.getSource();
		},

		onSaveShift: function () {
			var oModel = this.getModel(),
				oView = this.getModel("shiftsView"),
				sMode = oView.getProperty("/mode"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sID = oView.getProperty("/shiftID"),
				sCode = this.byId("code").getValue(),
				bDefaultShift = this.byId("defaultShift").getSelected(),
				bIgnoreWeekends = this.byId("ignoreWeekends").getSelected(),
				bIgnoreHolidays = this.byId("ignoreHolidays").getSelected(),
				oBC,
				sPath,
				that = this;

			if (sMode === "Create") {
				oBC = oModel.createEntry("/Shifts", {
					properties: {
						project_ID: sProjectID
					}
				});
				this.getView().setBindingContext(oBC);
			} else {
				oBC = this.getView().getBindingContext();
			}
			oModel.setProperty("code", sCode, oBC);
			oModel.setProperty("defaultShift", bDefaultShift, oBC);
			oModel.setProperty("ignoreWeekends", bIgnoreWeekends, oBC);
			oModel.setProperty("ignoreHolidays", bIgnoreHolidays, oBC);
			//oModel.submitChanges();
			oModel.submitChanges({
				success: function (oData) {
					if (sMode === "Create") { // newly created shift
						sID = oData.__batchResponses[0].__changeResponses[0].data.ID;
						oView.setProperty("/shiftID", sID);
						sPath = "/" + oModel.createKey("Shifts", {
							ID: sID
						});
						that.getView().bindElement({
							path: sPath
						});
						oModel.resetChanges(); // sometimes a created entity stays in the model
					}
				}
			});
			oView.setProperty("/enableSave", false);
			this.onCancel(); // have to go back in edit mode to add shift parts
		},

		onDeleteShift: function (oEvent) {
			var sShiftID = this.getModel("shiftsView").getProperty("/shiftID"),
				oModel = this.getModel(),
				sPath = "/" + oModel.createKey("Shifts", {
					ID: sShiftID
				}),
				sConfirmText = this.getResourceBundle().getText("confirmDeletionShiftText"),
				sConfirmTitle = this.getResourceBundle().getText("confirmDeletionShiftTitle"),
				aShiftPartsItems = this.byId("shiftPartsList").getItems(),
				that = this;

			MessageBox.warning(
				sConfirmText, {
					icon: MessageBox.Icon.WARNING,
					title: sConfirmTitle,
					actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
					initialFocus: MessageBox.Action.NO,
					onClose: function (sAction) {
						if (sAction === "YES") {
							oModel.remove(sPath); // removes shift parts
							that.onCancel();
						}
					}
				}
			);
		},

		_validateSaveEnablement: function () {
			var oView = this.getModel("shiftsView"),
				sCode = this.byId("code").getValue(),
				bDefaultShift = this.byId("defaultShift").getSelected(),
				bIgnoreWeekends = this.byId("ignoreWeekends").getSelected(),
				bIgnoreHolidays = this.byId("ignoreHolidays").getSelected();

			oView.setProperty("/enableSave", false);
			if (sCode) { // required
				if (oView.getProperty("/mode") === "Create") { // other fields don't matter
					oView.setProperty("/enableSave", true);
				} else {
					var oBC = this.getView().getBindingContext(),
						oData = oBC.getObject();
					if (sCode !== oData.code || bDefaultShift !== oData.defaultShift || bIgnoreWeekends !== oData.ignoreWeekends || bIgnoreHolidays !==
						oData.ignoreWeekends) {
						oView.setProperty("/enableSave", true);
					}
				}
			}
		},

		onCancel: function () {
			var oView = this.getModel("shiftsView"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID");
			if (oView.getProperty("/enableSave") || oView.getProperty("/shiftPartsOnEdit")) { // pending changes
				var oModel = this.getModel(),
					sText = this.getResourceBundle().getText("cancelEditWarningText"),
					sTitle = this.getResourceBundle().getText("cancelEditWarningTitle"),
					that = this;
				MessageBox.warning(
					sText, {
						icon: MessageBox.Icon.WARNING,
						title: sTitle,
						actions: [MessageBox.Action.YES, MessageBox.Action.NO],
						initialFocus: MessageBox.Action.NO,
						onClose: function (sAction) {
							if (sAction === "YES") {
								if (oModel.hasPendingChanges(false)) {
									oModel.resetChanges(); // just in case 
								}
								oView.setProperty("/enableSave", false);
								oView.setProperty("/shiftPartsOnEdit", false);
								if (oModel.hasPendingChanges(false)) {
									oModel.resetChanges(); // just in case 
								}
								that.getModel("appView").setProperty("/actionButtonsInfo/endColumn/fullScreen", false);
								that.getView().setBindingContext(undefined); // will refresh the form from the model next time
								that.getRouter().navTo("object", {
									objectId: sProjectID
								});
							}
						}
					}
				);
			} else {
				this.getModel("appView").setProperty("/actionButtonsInfo/endColumn/fullScreen", false);
				this.getRouter().navTo("object", {
					objectId: sProjectID
				});
			}
		},

		///////////////////////////////// LIST OF SHIFT PARTS /////////////////////////////////////

		onEditShiftPart: function (oEvent) {
			var oSelectedRow = oEvent.getSource().getParent(),
				aCells = oSelectedRow.getCells(),
				aPreviousCells,
				aRows = this.byId("shiftPartsList").getItems(),
				i, j, k;

			if (aCells[3].getIcon() === "sap-icon://save") { // save pressed
				var oStartTime = aCells[0].getDateValue(),
					oEndTime = aCells[1].getDateValue(),
					iStartHours = oStartTime.getHours(),
					iStartMins = oStartTime.getMinutes(),
					iEndHours = oEndTime.getHours(),
					iEndMins = oEndTime.getMinutes(),
					sTimeTypeID = aCells[2].getSelectedKey(),
					oBC = oSelectedRow.getBindingContext(),
					oModel = this.getModel(),
					sText = this.getResourceBundle().getText("endBeforeStartWarningText"),
					sTitle = this.getResourceBundle().getText("endBeforeStartWarningTitle");

				// out commented to allow shifts that span over midnight
				// check if end is after start
				/*				if (oStartTime.getTime() >= oEndTime.getTime()) {
									MessageBox.warning(
										"sText", {
											icon: MessageBox.Icon.WARNING,
											title: sTitle,
											actions: [MessageBox.Action.OK],
											onClose: function (sAction) {
												return;
											}
										}
									);
								} */
				this.getModel("shiftsView").setProperty("/shiftPartsOnEdit", false);
				// check if there are gaps between shift parts
				sText = this.getResourceBundle().getText("gapsBetweenShiftPartsWarningText");
				sTitle = this.getResourceBundle().getText("gapsBetweenShiftPartsWarningTitle");
				// first sort by start dates as the order might be changed due to an incorrect entry
				aRows.sort(function (a, b) {
					return a.getCells()[0].getDateValue().getTime() - b.getCells()[0].getDateValue().getTime();
				});
				for (i = 1; i < aRows.length; i++) {
					aCells = aRows[i].getCells();
					aPreviousCells = aRows[i - 1].getCells();
					if (aCells[0].getDateValue().getHours() !== aPreviousCells[1].getDateValue().getHours() ||
						aCells[0].getDateValue().getMinutes() !== aPreviousCells[1].getDateValue().getMinutes()) {
						MessageBox.warning(
							sText, {
								icon: MessageBox.Icon.WARNING,
								title: sTitle,
								actions: [MessageBox.Action.OK],
								onClose: function (sAction) {
									i = aRows.length;
								}
							}
						);
					}
				}
				// update entity in db
				oModel.setProperty("startTimeHrs", iStartHours, oBC);
				oModel.setProperty("startTimeMins", iStartMins, oBC);
				oModel.setProperty("endTimeHrs", iEndHours, oBC);
				oModel.setProperty("endTimeMins", iEndMins, oBC);
				oModel.setProperty("timeType_ID", sTimeTypeID, oBC);
				oModel.submitChanges();

				// update the row
				aCells = oSelectedRow.getCells();
				aCells[0].setEnabled(false);
				aCells[1].setEnabled(false);
				aCells[2].setEnabled(false);
				aCells[3].setIcon("sap-icon://edit");
				// enable all buttons
				for (i = 0; i < aRows.length; i++) {
					aCells = aRows[i].getCells();
					for (j = 3; j < 5; j++) {
						aCells[j].setEnabled(true);
					}
				}
			} else { // edit pressed
				this.getModel("shiftsView").setProperty("/shiftPartsOnEdit", true);
				// disable all controls, set edit icon
				for (i = 0; i < aRows.length; i++) {
					aCells = aRows[i].getCells();
					for (j = 0; j < 5; j++) {
						aCells[j].setEnabled(false);
					}
					aCells[3].setIcon("sap-icon://edit");
				}
				// change the selected row for editing
				aCells = oSelectedRow.getCells();
				for (k = 0; k < 5; k++) { // icons also need to be enabled
					aCells[k].setEnabled(true);
				}
				aCells[3].setIcon("sap-icon://save");
			}
		},

		onAddShiftPart: function () {
			var oModel = this.getModel(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sShiftID = this.getModel("shiftsView").getProperty("/shiftID"),
				aFilter = [new Filter({
					path: "project_ID",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: sProjectID
				})],
				aSorter = [new Sorter({
					path: "code",
					descending: false
				})],
				getTimeTypeID = function () {
					return new Promise(function (resolve, reject) {
						// read one time type of the project
						oModel.read("/TimeTypes", {
							urlParameters: {
								$inlinecount: "allpages",
								$top: 1
							},
							filters: aFilter,
							sorters: aSorter,
							success: function (oData) {
								if (oData.results.length > 0) {
									resolve(oData.results[0].ID);
								} else {
									resolve(null);
								}
							},
							error: function () {
								resolve(null);
							}
						});
					});
				},
				aItems = this.byId("shiftPartsList").getItems(),
				that = this;

			if (aItems && aItems.length > 0) { // there is already a shift part - read time type ID from there
				var aLastCells = aItems[aItems.length - 1].getCells(), // add after last shift part
					iStartHrs = aLastCells[1].getDateValue().getHours(), // start is end of last shift part
					iStartMins = aLastCells[1].getDateValue().getMinutes(),
					iEndHrs = iStartHrs + 1,
					iEndMins = iStartMins,
					sTimeTypeID = aLastCells[2].getSelectedKey();
				oModel.createEntry("/ShiftParts", {
					properties: {
						startTimeHrs: iStartHrs,
						startTimeMins: iStartMins,
						endTimeHrs: iEndHrs,
						endTimeMins: iEndMins,
						timeType_ID: sTimeTypeID,
						shift_ID: sShiftID
					}
				});
				oModel.submitChanges();
			} else { // read a time type ID from db
				getTimeTypeID().then(function (timeTypeID) {
					if (!timeTypeID) {
						var sText = that.getResourceBundle().getText("noTimeTypesErrorText"),
							sTitle = that.getResourceBundle().getText("noTimeTypesErrorTitle");
						MessageBox.warning(
							sText, {
								icon: MessageBox.Icon.WARNING,
								title: sTitle,
								actions: [MessageBox.Action.OK],
								onClose: function (sAction) {
									return;
								}
							}
						);
					}
					oModel.createEntry("/ShiftParts", {
						properties: {
							startTimeHrs: 0,
							startTimeMins: 0,
							endTimeHrs: 0,
							endTimeMins: 0,
							timeType_ID: timeTypeID,
							shift_ID: sShiftID
						}
					});
					oModel.submitChanges();
				});
			}
		},

		onDeleteShiftPart: function (oEvent) {
			var oParent = oEvent.getSource().getParent(),
				sPath = oParent.getBindingContext().getPath(),
				oModel = this.getModel(),
				sConfirmText = this.getResourceBundle().getText("confirmDeletionShiftPartText"),
				sConfirmTitle = this.getResourceBundle().getText("confirmDeletionShiftPartTitle");

			MessageBox.warning(
				sConfirmText, {
					icon: MessageBox.Icon.WARNING,
					title: sConfirmTitle,
					actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
					initialFocus: MessageBox.Action.NO,
					onClose: function (sAction) {
						if (sAction === "YES") {
							oModel.remove(sPath);
						}
					}
				}
			);
		},

		onShiftPartsListUpdateFinished: function (oEvent) {
			var sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("shiftsView");

			// only update the counter if the length is final
			if (this.byId("shiftPartsList").getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("shiftPartsListTitle", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("shiftPartsListTitleEmpty");
				}
				oViewModel.setProperty("/shiftPartsListTitle", sTitle);
				// filter time types select control for the project (didn't work in XML)
				/*				var aItems = this.byId("shiftPartsList").getItems(),
									oCell;
								for (var i = 0; i < aItems.length; i++) {
									oCell = aItems[i].getCells()[2];
									/*if (this.byId("timeType") && this.byId("timeType").getBinding("items").isLengthFinal()) {
											var aFilters = [new Filter({
												path: "project_ID",
												operator: sap.ui.model.FilterOperator.EQ,
												value1: sProjectID
											})];
											this.byId("timeType").getBinding("items").filter(aFilters, "Application"); 
									} 
								} */
			}
		},

		toggleFullScreen: function () {
			var bFullScreen = this.getModel("appView").getProperty("/actionButtonsInfo/endColumn/fullScreen");
			this.getModel("appView").setProperty("/actionButtonsInfo/endColumn/fullScreen", !bFullScreen);
			if (!bFullScreen) {
				// store current layout and go full screen
				this.getModel("appView").setProperty("/previousLayout", this.getModel("appView").getProperty("/layout"));
				this.getModel("appView").setProperty("/layout", "EndColumnFullScreen");
			} else {
				// reset to previous layout
				this.getModel("appView").setProperty("/layout", this.getModel("appView").getProperty("/previousLayout"));
			}
		}

	});

});