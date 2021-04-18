sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"../model/formatter"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator, formatter) {
	"use strict";

	return BaseController.extend("project.data.ProjectData.controller.Users", {

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
					lineItemTableDelay: 0,
					userID: "",
					selected: false,
					multiSelect: false,
					countUsers: 0,
					userListTitle: ""
				}),
				oList = this.byId("userList"),
				iOriginalBusyDelay = oList.getBusyIndicatorDelay();

			this.setModel(oViewModel, "userModel");

			oList.attachEventOnce("updateFinished", function () {
				// Restore original busy indicator delay for the list
				oViewModel.setProperty("/delay", iOriginalBusyDelay);
			});

			this.getRouter().getRoute("Users").attachPatternMatched(this._onObjectMatched, this);
		},

		onSelectionChange: function (oEvent) {
			var aSelectedUsers = this.byId("userList").getSelectedItems(),
				oViewModel = this.getModel("userModel");
			if (aSelectedUsers && aSelectedUsers.length > 0) {
				oViewModel.setProperty("/selected", true);
				if (aSelectedUsers.length > 1) {
					oViewModel.setProperty("/multiSelect", true);
				}
			} else {
				oViewModel.setProperty("/selected", false);
				oViewModel.setProperty("/multiSelect", false);
			}
		},

		onAddUser: function (oEvent) {
			var sPressedItemID,
				oPressedItemContext,
				oModel = this.getModel(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				aSelectedUsers = this.byId("userList").getSelectedItems(),
				that = this;
			if (!aSelectedUsers || aSelectedUsers.length === 0) {
				return;
			}
			for (var i = 0; i < aSelectedUsers.length; i++) {
				oPressedItemContext = aSelectedUsers[i].getBindingContext();
				sPressedItemID = oPressedItemContext.getProperty("ID");
				oModel.createEntry("UsersOfProject", {
					properties: {
						project_ID: sProjectID,
						person_ID: sPressedItemID
					}
				});
			}
			oModel.submitChanges({
				success: function (oData) {
					that._filterUserList();
				}
			});

		},

		onRemoveUser: function (oEvent) {
			var oDraggedItem = oEvent.getParameter("draggedControl"),
				oDraggedItemContext = oDraggedItem.getBindingContext(),
				oDraggedItemID = oDraggedItemContext.getProperty("ID");
			if (!oDraggedItemContext) {
				return;
			}

			var oModel = this.getModel(),
				sPath = "/" + oModel.createKey("UsersOfProject", {
					ID: oDraggedItemID
				});
			oModel.remove(sPath);
			this._filterUserList();
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		_onObjectMatched: function (oEvent) {
			//var sObjectId = oEvent.getParameter("arguments").objectId;
			//this.getModel("appView").setProperty("/layout", "ThreeColumnsEndExpanded");
			//this.getModel("appView").setProperty("/selectedProjectID", sObjectId);
			this._filterUserList();
		},

		onUserListUpdateFinished: function (oEvent) {
			this._updateUserListItemCount(oEvent.getParameter("total"));
		},

		_updateUserListItemCount: function (iTotalItems) {
			var sTitle,
				oViewModel = this.getModel("userModel");
			// only update the counter if the length is final
			if (this.byId("userList").getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("personListTitle", [iTotalItems]);
				oViewModel.setProperty("/userListTitle", sTitle);
				oViewModel.setProperty("/countUsers", iTotalItems);
			}
		},

		_filterUserList: function () {
			var oModel = this.getModel(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				oProjectFilter = [new Filter({
					path: "project_ID",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: sProjectID
				})],
				oUserListBinding = this.byId("userList").getBinding("items"),
				aUserFilters = [],
				aUserAndFilters = [];
			if (!sProjectID || sProjectID === "") {
				return;
			}
			// read existing assigned users and exclude them from the selection list of users
			oModel.read("/UsersOfProject", {
				filters: oProjectFilter,
				success: function (oData) {
					if (oData.results && oData.results.length > 0) {
						for (var i = 0; i < oData.results.length; i++) {
							aUserFilters.push(new sap.ui.model.Filter({
								path: "ID",
								operator: sap.ui.model.FilterOperator.NE,
								value1: oData.results[i].person_ID
							}));
						}
						aUserAndFilters = new sap.ui.model.Filter({
							filters: aUserFilters,
							and: true
						});
						oUserListBinding.filter(aUserAndFilters, "Application");
					}
				}
			});
		},

		onCloseDetailPress: function () {
			var sProjectID = this.getModel("appView").getProperty("/selectedProjectID");
			this.getModel("appView").setProperty("/actionButtonsInfo/endColumn/fullScreen", false);
			this.getRouter().navTo("object", {
				objectId: sProjectID
			});
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